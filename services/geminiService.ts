import { GoogleGenAI, Modality, LiveServerMessage } from "@google/genai";
import { GroundingSource, PlaceInfo } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

export async function getNearbyPlaces(locationQuery: string): Promise<{ places: PlaceInfo[], sources: GroundingSource[] }> {
  const prompt = `Based on the location "${locationQuery}", identify 3 to 5 nearby interesting, lesser-known, or "hidden gem" locations suitable for a tourist. For each place, provide a name, a catchy one-liner description (oneLiner), a detailed, engaging description for a tourist (description), and a simple category (e.g., "Nature", "Architecture", "History", "Food", "Art", "Other").

Return your response ONLY as a valid JSON array inside a single markdown \`\`\`json code block. Do not include any text, titles, or introductions outside of the code block.

Example format:
\`\`\`json
[
  {
    "name": "The Whispering Alley",
    "oneLiner": "A narrow street with unique acoustic properties.",
    "description": "The Whispering Alley is a fascinating historical oddity tucked away from the main square. Its curved stone walls create a natural parabolic reflector, allowing a whisper to be heard clearly from end to end...",
    "category": "History"
  },
  {
    "name": "Verdant Valley Lookout",
    "oneLiner": "A breathtaking view of the entire valley.",
    "description": "A short hike from the main road leads to this stunning lookout point. It offers panoramic views of the Verdant Valley and is an ideal spot for photography, especially at sunrise.",
    "category": "Nature"
  }
]
\`\`\`
`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }, { googleMaps: {} }],
    },
  });

  const text = response.text;
  const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];

  const sources: GroundingSource[] = groundingChunks.flatMap(chunk => {
    const results: GroundingSource[] = [];
    if (chunk.web && chunk.web.uri) {
        results.push({ uri: chunk.web.uri, title: chunk.web.title || 'Web Source', type: 'web' });
    }
    if (chunk.maps && chunk.maps.uri) {
        results.push({ uri: chunk.maps.uri, title: chunk.maps.title || 'Map Location', type: 'maps' });
    }
    return results;
  });

  try {
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/);
    if (!jsonMatch || !jsonMatch[1]) {
      throw new Error("Could not find a JSON code block in the response.");
    }
    const jsonString = jsonMatch[1];
    const places: PlaceInfo[] = JSON.parse(jsonString);
    return { places, sources };
  } catch (e) {
    console.error("Failed to parse places from Gemini response:", text, e);
    throw new Error("The AI returned an unexpected format. Please try again.");
  }
}

export async function getTextToSpeech(text: string, language: 'english' | 'hindi'): Promise<string> {
    const prompt = language === 'hindi'
        ? `Translate the following English text to Hindi and then say it in a clear, friendly voice. Text: "${text}"`
        : `Say the following English text in a clear, friendly voice with an Indian accent. Text: "${text}"`;

    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: prompt }] }],
        config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
                voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: 'Kore' },
                },
            },
        },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
        throw new Error("Failed to generate audio from text.");
    }
    return base64Audio;
}

export function startLiveConversation(callbacks: {
    onopen: () => void;
    onmessage: (message: LiveServerMessage) => Promise<void>;
    onerror: (e: ErrorEvent) => void;
    onclose: (e: CloseEvent) => void;
}) {
    return ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks,
        config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
            },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            systemInstruction: 'You are a helpful and curious travel guide. Answer questions about locations, history, and culture. Keep your answers concise and engaging.',
        },
    });
}