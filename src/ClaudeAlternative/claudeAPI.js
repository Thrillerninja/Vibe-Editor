
import Anthropic from '@anthropic-ai/sdk';

function buildPrompt(sentences, layers) {
    return `
You will receive an array of sentences and must build a hierarchical tree according to the following rules:

INPUT SENTENCES:
${sentences.map((sentence, i) => `${i + 1}. ${sentence.content}`).join("\n")}

NUMBER OF LAYERS REQUESTED: ${layers}

------------------ TREE CREATION RULES ------------------

1. SENTENCES → LEAF NODES
   - Every sentence from the input array MUST become exactly one leaf node.
   - Each leaf node MUST have all attributes:
     id, level, type, label, content, order, emotion, children.
   - Leaf node template:
     {
       "id": "<unique-id>",
       "level": ${layers - 1},
       "type": "leaf",
       "label": "<short label>",
       "content": "<full sentence>",
       "order": <sentence index>,
       "emotion": "NEUTRAL",
       "children": []
     }


2. TOPIC NODES (REGULAR NODES)
   - Group semantically related sentences into topics.
   - For each topic, generate ONE regular node whose:
     label/content summarize the topic (e.g., “Weather forecast”).
   - These nodes must also include:
     id, level, type, label, content, order, emotion, children.
   - The children of a topic node are the leaf nodes belonging to that topic.

3. ROOT NODE
   - The root node must contain ALL topic nodes as its children.
   - The root node MUST contain:
     {
       "id": "root",
       "level": 0,
       "type": "root",
       "label": "Document",
       "content": "",
       "order": 0,
       "emotion": "NEUTRAL",
       "children": [ ...topic nodes... ]
     }

4. STRICT ATTRIBUTE REQUIREMENT
   EVERY node—root, topic, or leaf—must have:
   - id
   - level
   - type
   - label
   - content
   - order
   - emotion
   - children

5. TREE DEPTH
   - The number of layers requested (${layers}) determines the depth:
       level = 0 → root
       level = 1 → topic nodes
       level = ${layers - 1} → leaf nodes
6. FURTHER DETAILS
   - The node ids should be a single integer and unique
   - choose the Emotion for each node from this list: [POSITIVE, NEGATIVE, NEUTRAL, EMPHASIS, UNCERTAIN].


6. OUTPUT FORMAT
   - Output a SINGLE JSON object representing the ROOT node.
   - No explanation, no text — only valid JSON.

------------------ BEGIN OUTPUT NOW ------------------
`;
}


const getClient = () => {
    const apiKey = import.meta.env.VITE_CLAUDE_API_KEY;

    if (!apiKey || apiKey === 'your_api_key_here') {
        throw new Error(
            'Claude API key not configured. Please set VITE_CLAUDE_API_KEY in your .env file.\n' +
            'Get your API key from https://console.anthropic.com/'
        );
    }

    return new Anthropic({
        apiKey,
        dangerouslyAllowBrowser: true // Note: In production, API calls should go through a backend
    });
};

export async function buildTree(sentences, layers) {
    const client = getClient();
    const prompt = buildPrompt(sentences, layers);
    console.log("SEN", sentences.map((sentence, i) => `${i + 1}. ${sentence.content}`).join("\n"))
    try {
        const message = await client.messages.create({
            model: 'claude-3-5-haiku-20241022',
            max_tokens: 4096,
            messages: [{
                role: 'user',
                content: prompt
            }]
        });

        const responseText = message.content[0].text;
        console.log('[ClaudeALTERNATIVE Service] Received dirty subtree restructure:', responseText);

    } catch (error) {
        throw new Error(`Failed to restructure dirty nodes: ${error.message}`);
    }
}


