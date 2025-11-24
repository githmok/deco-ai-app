import { GoogleGenAI, Chat, GenerateContentResponse } from "@google/genai";
import { ChatMessage } from "../types";

// Fix for TS2580: Declare process for TypeScript environment
declare const process: {
  env: {
    API_KEY: string;
    [key: string]: string | undefined;
  };
};

const getClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key not found in environment variables");
  }
  return new GoogleGenAI({ apiKey });
};

// Helper to convert base64 string to clean data for API
const cleanBase64 = (dataUrl: string) => {
  if (!dataUrl) return '';
  // Remove the data URL prefix (e.g., "data:image/jpeg;base64,")
  const split = dataUrl.split(',');
  return split.length > 1 ? split[1] : dataUrl;
};

// Helper to extract mime type from data URL
const getMimeType = (dataUrl: string) => {
  if (!dataUrl) return 'image/jpeg';
  const match = dataUrl.match(/^data:(.*);base64,/);
  return match ? match[1] : 'image/jpeg';
};

export const generateRoomRedesign = async (
  base64Image: string,
  prompt: string,
  textureImage?: string | null
): Promise<string> => {
  const ai = getClient();
  
  // Use flash-image for fast high quality visual editing
  const modelId = 'gemini-2.5-flash-image';

  const parts: any[] = [];

  // Validate inputs
  if (base64Image.startsWith('http')) {
     throw new Error("Invalid image format. Please ensure image is uploaded correctly.");
  }

  // 1. Add original image with correct MIME type
  parts.push({
    inlineData: {
      mimeType: getMimeType(base64Image),
      data: cleanBase64(base64Image),
    }
  });

  // 2. Add texture if present
  if (textureImage) {
    if (textureImage.startsWith('http')) {
       throw new Error("Texture image could not be processed. Please try uploading it manually.");
    }
    parts.push({
      inlineData: {
        mimeType: getMimeType(textureImage),
        data: cleanBase64(textureImage),
      }
    });
  }

  // 3. Add text instruction
  let finalPrompt = "";
  
  const isFixedTextureMode = prompt === 'STRICT_TEXTURE_ONLY';

  if (isFixedTextureMode) {
    // STRICT FIXED MODE logic
    if (textureImage) {
        finalPrompt = `
        SYSTEM ROLE: Expert Interior Architecture visualizer.
        OUTPUT QUALITY: Hyper-realistic, 4K, Architectural Photography, Highly detailed textures.

        Task: Apply the wallpaper/pattern from Image 2 to the WALLS of the room in Image 1.
        
        CRITICAL GEOMETRY LOCK:
        - DO NOT MOVE, REMOVE, OR ALTER ANY FURNITURE. 
        - DO NOT CHANGE FLOORING OR CEILING.
        - The position of every object must remain PIXEL-PERFECT to the original.
        
        EXECUTION STEPS:
        1. Identify vertical wall surfaces in Image 1.
        2. Map the texture from Image 2 onto these walls with realistic perspective and scale.
        3. Maintain all existing shadows, lighting, and occlusions.
        4. Render the final image in high definition.
        `;
     } else {
        finalPrompt = `Instruction: Enhance image quality to 4K resolution. Keep the room EXACTLY as is.`;
     }
  } else {
    // STYLED REDESIGN
    let textureInstruction = "";
    if (textureImage) {
      textureInstruction = `
      WALLPAPER INSTRUCTION: 
      - The provided Image 2 is the wallpaper pattern.
      - Apply this exact pattern to the walls.
      - Ensure the scale of the pattern is realistic for a room.
      `;
    } else {
      textureInstruction = `Wall Style: Update wall colors and materials to match the ${prompt} style perfectly.`;
    }

    finalPrompt = `
    SYSTEM ROLE: High-End Interior Designer.
    OUTPUT QUALITY: 4K, Photorealistic, Magazine Quality.
    
    Target Style: ${prompt}.
    ${textureInstruction}

    STRICT CONSTRAINTS:
    1. GEOMETRY & LAYOUT: PRESERVE EXACTLY. Do not move the sofa, table, lamps, or windows.
    2. FURNITURE: Keep existing furniture models but update their material/fabric to match the "${prompt}" style if needed.
    3. LIGHTING: Keep the original natural lighting direction but enhance contrast and warmth.
    4. WALLS: Apply the style/texture cleanly behind the furniture.
    `;
  }

  parts.push({ text: finalPrompt });

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: { parts },
      config: {
        // We rely on the model's default output handling for images
      }
    });

    const candidates = response.candidates;
    if (!candidates || candidates.length === 0) throw new Error("No response generated");

    const content = candidates[0].content;
    if (!content || !content.parts) throw new Error("Invalid response format");

    // Check for image parts
    for (const part of content.parts) {
      if (part.inlineData) {
        // Use the returned mime type or default to image/png
        const mimeType = part.inlineData.mimeType || 'image/png';
        return `data:${mimeType};base64,${part.inlineData.data}`;
      }
    }
    
    // Check for text refusal/error
    const textPart = content.parts.find(p => p.text);
    if (textPart) {
        console.warn("Model returned text instead of image:", textPart.text);
        // Sometimes the model answers "I cannot do that". We treat this as an error for the UI.
        throw new Error(`AI Refusal: ${textPart.text}`);
    }
    
    throw new Error("No image data returned from API. The model may have filtered the response.");

  } catch (error) {
    console.error("Gemini Service Error:", error);
    throw error;
  }
};

export const sendChatMessage = async (
  history: ChatMessage[],
  newMessage: string,
  currentImageContext: string | null
): Promise<ChatMessage> => {
  const ai = getClient();
  const modelId = 'gemini-2.5-flash';

  const parts: any[] = [];
  
  if (currentImageContext && !currentImageContext.startsWith('http')) {
    parts.push({
      inlineData: {
        mimeType: getMimeType(currentImageContext),
        data: cleanBase64(currentImageContext),
      }
    });
  }

  const systemPrompt = `You are an expert interior design assistant for the "DecoAI" app. 
  Your role is to help users refine their room designs and find products.
  
  Context: The user is looking at an interior design image (provided).
  
  Capabilities:
  1. Critique and Analyze: specific details about the style, color, and furniture.
  2. Suggestions: Suggest changes.
  3. Shopping: You have access to Google Search. When a user asks about an item (e.g., "Where can I buy that wallpaper?" or "Buy blue rug"), ALWAYS use the googleSearch tool to find real, buyable links for similar items.
  
  Tone: Professional, encouraging, and helpful. concise.`;

  parts.push({ text: `${systemPrompt}\n\nUser Query: ${newMessage}` });

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: { parts },
      config: {
        tools: [{ googleSearch: {} }],
      }
    });

    const text = response.text || "متاسفانه نتوانستم پاسخی تولید کنم.";
    
    // Safe access to candidates
    const candidates = response.candidates;
    let groundingChunks: any[] = [];

    if (candidates && candidates.length > 0) {
       const metadata = candidates[0].groundingMetadata;
       if (metadata && metadata.groundingChunks) {
           groundingChunks = metadata.groundingChunks;
       }
    }
    
    const webLinks: { uri: string; title: string }[] = [];

    if (groundingChunks) {
      groundingChunks.forEach((chunk: any) => {
        if (chunk.web) {
          webLinks.push(chunk.web);
        }
      });
    }

    return {
      id: Date.now().toString(),
      role: 'model',
      text,
      timestamp: Date.now(),
      groundingMetadata: {
        web: webLinks
      }
    };

  } catch (error) {
    console.error("Chat error:", error);
    throw error;
  }
};
