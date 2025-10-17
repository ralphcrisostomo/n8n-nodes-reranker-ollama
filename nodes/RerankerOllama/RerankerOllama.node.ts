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
				displayName: 'Model',
				name: 'model',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getModels' },
				default: 'dengcao/Qwen3-Reranker-8B:Q3_K_M',
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
			async getModels(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const credentials = (await this.getCredentials('ollamaApi')) as {
					baseUrl: string;
					apiKey?: string;
				};
				const baseUrl = (credentials.baseUrl || '').replace(/\/+$/, '');
				const resp = await fetch(`${baseUrl}/models`, {
					method: 'GET',
					headers: {
						'Content-Type': 'application/json',
						...(credentials.apiKey ? { Authorization: `Bearer ${credentials.apiKey}` } : {}),
					},
				});

				if (!resp.ok) {
					throw new NodeOperationError(
						this.getNode(),
						`Failed to fetch models: ${resp.status} ${resp.statusText}`,
						{ itemIndex: 0 },
					);
				}

				const result = (await resp.json()) as { data?: Array<{ id: string }> };
				return (result.data ?? []).map((m) => ({ name: m.id, value: m.id }));
			},
		},
	};

	async supplyData(this: ISupplyDataFunctions, itemIndex: number): Promise<SupplyData> {
		this.logger.debug('Supply data for reranking Ollama');

		const rerank = async (documents: any, query: any) => {
			const credentials = (await this.getCredentials('rerankerOllamaApi')) as {
				baseUrl: string;
				apiKey?: string;
			};
			const model = this.getNodeParameter('model', itemIndex) as string;
			const topN = this.getNodeParameter('topN', itemIndex) as number;
			const headers: Record<string, string> = { 'Content-Type': 'application/json' };
			if (credentials.apiKey) headers.Authorization = `Bearer ${credentials.apiKey}`;

			const baseUrl = (credentials.baseUrl || 'http://localhost:11434').replace(/\/+$/, '');
			const url = `${baseUrl}/api/generate`;

			// Build ranking prompt
			const passagesText = documents
				.map((doc: any, i: any) => `Document ${i + 1}: ${doc.pageContent}`)
				.join('\n\n');

			const prompt = `
				You are a reranker model. Rank the following documents by relevance to the query.

				Query: "${query}"

				Documents:
				${passagesText}

				Return a JSON array of objects: [{"index": number, "score": number}] with highest scores first.
			`;

			const payload = { model, prompt, stream: false };

			console.log(JSON.stringify({ url }, null, 2));
			console.log(JSON.stringify({ headers }, null, 2));
			console.log(JSON.stringify({ payload }, null, 2));

			const response = (await this.helpers.httpRequest({
				method: 'POST',
				url,
				headers,
				body: JSON.stringify(payload),
			})) as any;

			// Ollama returns a text completion; extract JSON
			const text = response.response || response.output || response;
			const jsonMatch = text.match(/\[[\s\S]*\]/);
			if (!jsonMatch)
				throw new NodeOperationError(this.getNode(), 'Failed to parse reranker output.', {
					itemIndex,
				});

			let results = [];
			try {
				results = JSON.parse(jsonMatch[0]);
			} catch {
				throw new NodeOperationError(this.getNode(), 'Invalid JSON in reranker response.', {
					itemIndex,
				});
			}

			const rankings = results.slice(0, Math.min(topN, results.length));
			return rankings.map((r: any) => ({
				index: r.index - 1,
				relevanceScore: r.score,
			}));
		};

		const compressDocuments = async (documents: any[], query: string) => {
			if (!documents?.length) return [];
			const results = await rerank(documents, query);
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
