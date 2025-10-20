import {
	INodeType,
	INodeTypeDescription,
	ISupplyDataFunctions,
	SupplyData,
	NodeConnectionTypes,
	NodeOperationError,
	ILoadOptionsFunctions,
	INodePropertyOptions,
} from 'n8n-workflow';

export class RerankerOllama implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Reranker Ollama',
		name: 'rerankerOllama',
		icon: { light: 'file:RerankerOllama.svg', dark: 'file:RerankerOllama.svg' },
		group: ['transform'],
		version: 1,
		description:
			'Use Ollama Reranker to reorder documents after retrieval from a vector store by relevance to the given query.',
		defaults: {
			name: 'Reranker Ollama',
		},
		requestDefaults: {
			ignoreHttpStatusErrors: true,
			baseURL: '={{ $credentials.host }}',
		},
		credentials: [
			{
				name: 'ollamaApi',
				required: true,
			},
		],
		codex: {
			categories: ['AI'],
			subcategories: {
				AI: ['Rerankers'],
			},
			resources: {
				primaryDocumentation: [
					{
						url: 'https://build.nvidia.com/nvidia/rerank-qa-mistral-4b?snippet_tab=Node',
					},
				],
			},
		},
		inputs: [],
		outputs: [NodeConnectionTypes.AiReranker],
		outputNames: ['Reranker'],
		properties: [
			{
				displayName: 'Model Name or ID',
				name: 'model',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getModels' },
				default: 'dengcao/Qwen3-Reranker-4B:Q5_K_M',
				description:
					'The model that should be used to rerank the documents. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				required: true,
			},
			{
				displayName: 'Top N',
				name: 'topN',
				type: 'number',
				description: 'The maximum number of documents to return after reranking',
				default: 3,
			},
		],
	};

	methods = {
		loadOptions: {
			/**
			 * Dynamically load all available Ollama models.
			 */
			async getModels(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				// --- 1️⃣ Get credentials ---
				const credentials = (await this.getCredentials('ollamaApi')) as {
					baseUrl: string;
					apiKey?: string;
				};

				const baseUrl = (credentials.baseUrl || '').replace(/\/+$/, '') || 'http://localhost:11434';

				// --- 2️⃣ Fetch models from Ollama API ---
				let response: Response;
				try {
					response = await fetch(`${baseUrl}/api/tags`, {
						method: 'GET',
						headers: {
							'Content-Type': 'application/json',
							...(credentials.apiKey ? { Authorization: `Bearer ${credentials.apiKey}` } : {}),
						},
					});
				} catch (error) {
					throw new NodeOperationError(
						this.getNode(),
						`Network error connecting to Ollama at ${baseUrl}: ${(error as Error).message}`,
					);
				}

				if (!response.ok) {
					throw new NodeOperationError(
						this.getNode(),
						`Failed to fetch Ollama models (${response.status} ${response.statusText}) from ${baseUrl}`,
					);
				}

				// --- 3️⃣ Parse and validate response ---
				const data = (await response.json()) as {
					models?: Array<{
						name: string;
						size?: number;
						modified_at?: string;
					}>;
				};

				if (!data.models || !Array.isArray(data.models)) {
					throw new NodeOperationError(
						this.getNode(),
						'Unexpected response: missing "models" array from Ollama API.',
					);
				}

				// --- 4️⃣ Map to n8n-compatible options ---
				const options: INodePropertyOptions[] = data.models.map((model) => {
					const sizeGB = model.size
						? (model.size / 1_073_741_824).toFixed(1) + ' GB'
						: 'Unknown size';
					const modified = model.modified_at
						? new Date(model.modified_at).toLocaleString()
						: 'Unknown date';

					return {
						name: `${model.name} (${sizeGB})`,
						value: model.name,
						description: `Last updated: ${modified}`,
					};
				});

				const whitelist = ['qwen3-reranker'];

				return options.filter((option: any) => {
					const value = option.value?.toLowerCase?.() || '';
					return whitelist.some((allowed) => value.includes(allowed));
				});
			},
		},
	};

	async supplyData(this: ISupplyDataFunctions, itemIndex: number): Promise<SupplyData> {
		this.logger.debug('Supply data for reranking Ollama');

		// Note: This logic is based on https://apidog.com/blog/qwen-3-embedding-reranker-ollama/
		const rerankQwen = async (documents: any[], query: string) => {
			const credentials = (await this.getCredentials('ollamaApi')) as {
				baseUrl: string;
				apiKey?: string;
			};

			const model = this.getNodeParameter('model', itemIndex) as string;
			const topN = this.getNodeParameter('topN', itemIndex) as number;

			const headers: Record<string, string> = { 'Content-Type': 'application/json' };
			if (credentials.apiKey) headers.Authorization = `Bearer ${credentials.apiKey}`;

			const baseUrl = (credentials.baseUrl || 'http://localhost:11434').replace(/\/+$/, '');
			const url = `${baseUrl}/api/chat`;

			// Run reranker for each document
			const rerankCall = documents.map(async (doc: any, index: number) => {
				const messages = [
					{
						role: 'user',
						content: `You are an expert relevance grader. For each document, determine whether it is relevant to the query. Respond with a simple 'Yes' or 'No'.\n\n Query: "${query}"\nDocument: ${doc.pageContent}`,
					},
				];

				const payload = {
					model,
					messages,
					options: {
						temperature: 0.0,
						num_predict: 200,
					},
					stream: false,
				};
				const response = (await this.helpers.httpRequest({
					method: 'POST',
					url,
					headers,
					body: JSON.stringify(payload),
				})) as any;

				const answer = response?.message?.content?.trim()?.toLowerCase();
				return {
					index,
					relevanceScore: answer?.includes('yes') ? 1 : 0,
				};
			});

			const results = await Promise.all(rerankCall);

			console.log(JSON.stringify({ results }, null, 2));

			// Sort descending by relevance and limit topN
			const sorted = results.sort((a, b) => b.relevanceScore - a.relevanceScore);
			return sorted.slice(0, Math.min(topN, sorted.length));
		};

		const compressDocuments = async (documents: any[], query: string) => {
			if (!documents?.length) return [];
			// Note: Currently only supports Qwen3-Reranker!
			const results = await rerankQwen(documents, query);
			const finalResults = results.map((result: any) => {
				const doc = documents[result.index];
				doc.metadata = doc.metadata || {};
				doc.metadata.relevanceScore = result.relevanceScore;
				return doc;
			});
			return finalResults;
		};

		return {
			response: {
				compressDocuments,
			},
		};
	}
}
