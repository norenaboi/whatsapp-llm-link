import OpenAI from 'openai';
import axios from 'axios';
import { getAvailableImages } from './imageResolver';

// Define types needed
interface LLMSettings {
  provider: 'openai' | 'local' | 'custom';
  model: string;
  temperature: number;
  systemPrompt: string;
  maxHistoryLength: number;
  apiKey?: string;
  apiEndpoint?: string;
  customApiKey?: string;
}

interface Chat {
  id: string;
  name: string;
  isGroup: boolean;
  unreadCount: number;
  timestamp: number;
  autoReplyEnabled: boolean;
  messages: ChatMessage[];
  lastMessage?: ChatMessage;
}

interface ChatMessage {
  id: string;
  body: string;
  fromMe: boolean;
  timestamp: number;
  author?: string;
  hasMedia: boolean;
  isForwarded: boolean;
  isStarred: boolean;
  isLLMResponse: boolean;
}

interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// State
let llmSettings: LLMSettings;
let openaiClient: OpenAI | null = null;

// Configure LLM with settings
export function configureLLM(settings: LLMSettings) {
  llmSettings = settings;
  
  // Initialize OpenAI client if using OpenAI
  if (settings.provider === 'openai' && settings.apiKey) {
    openaiClient = new OpenAI({
      apiKey: settings.apiKey
    });
  } else {
    openaiClient = null;
  }
}

function stripTimestampLines(text: string): string {
  return text
    .split('\n')
    .filter(line => !/^\[Sent at.*\|.*\]/.test(line.trim()))
    .join('\n')
    .trim();
}

// Generate LLM response for a chat
export async function generateLLMResponse(chat: Chat): Promise<string | null> {
  try {
    const messages = prepareMessagesForLLM(chat);

    let response: string | null;
    switch (llmSettings.provider) {
      case 'openai':
        response = await generateOpenAIResponse(messages);
        break;
      case 'local':
      case 'custom':
        response = await generateCustomEndpointResponse(messages);
        break;
      default:
        throw new Error(`Unsupported LLM provider: ${llmSettings.provider}`);
    }

    if (!response) return null;
    return stripTimestampLines(response);

  } catch (error) {
    console.error('Error generating LLM response:', error);
    return "I'm having trouble connecting to my AI service right now. Please try again later.";
  }
}

// Formats a Unix timestamp (seconds) into a human-readable string
function formatTimestamp(timestampSeconds: number): string {
  const date = new Date(timestampSeconds * 1000);
  return date.toLocaleString('en-US', {
    hour:    '2-digit',
    minute:  '2-digit',
    hour12:  false,
  });
}

// Prepare messages for LLM by converting chat messages to proper format
function prepareMessagesForLLM(chat: Chat): LLMMessage[] {
  const availableImages = getAvailableImages();
  const imageInstructions = availableImages.length > 0
    ? `\n\nWhen you want to send an image, output its filename on its own line using this exact format: [Image: filename.ext]\nAvailable images: ${availableImages.join(', ')}`
    : '';

  // Start with system message
  const messages: LLMMessage[] = [
    { role: 'system', content: llmSettings.systemPrompt + imageInstructions }
  ];

  // Add recent messages from chat
  const chatMessages = [...chat.messages].slice(-llmSettings.maxHistoryLength * 2);

  let prevTimestamp: number | null = null;

  for (const message of chatMessages) {
    // --- build the timestamp line ---
    const ts = message.timestamp;                       // seconds since epoch
    const tsStr = formatTimestamp(ts);

    const timestampLine = `[Sent at ${tsStr}]`;
    prevTimestamp = ts;

    // Prepend the metadata line to the message body
    const content = `${timestampLine}\n${message.body}`;

    messages.push({
      role: message.fromMe ? 'assistant' : 'user',
      content,
    });
  }

  return messages;
}

// Generate response using OpenAI
async function generateOpenAIResponse(messages: LLMMessage[]): Promise<string | null> {
  if (!openaiClient) {
    throw new Error('OpenAI client not initialized');
  }
  
  const response = await openaiClient.chat.completions.create({
    model: llmSettings.model,
    messages: messages as any, // Type cast needed due to OpenAI types
    temperature: llmSettings.temperature,
    max_tokens: 500,
  });
  
  return response.choices[0]?.message.content || null;
}

// Generate response using custom endpoint (local or custom API)
async function generateCustomEndpointResponse(messages: LLMMessage[]): Promise<string | null> {
  if (!llmSettings.apiEndpoint) {
    throw new Error('API endpoint not configured');
  }
  
  // Prepare request in OpenAI-compatible format
  const payload = {
    model: llmSettings.model,   // e.g., "llama3"
    stream:false,
    messages: messages.map(m => ({
      role: m.role,
      content: m.content
    })),
    temperature: llmSettings.temperature,
    max_tokens: 500,
  };

  const response = await axios.post(llmSettings.apiEndpoint, payload, {
    headers: {
      'Content-Type': 'application/json',
      ...(llmSettings.customApiKey && { 'Authorization': `Bearer ${llmSettings.customApiKey}` }),
    },
  });
  console.log(response.data)

  // Handle OpenAI-compatible response shape (custom endpoints, OpenRouter, etc.)
  const openAIContent = response.data?.choices?.[0]?.message?.content;
  if (openAIContent) return openAIContent;

  // Fallback: handle native Ollama response shape (/api/generate or /api/chat)
  const ollamaContent = response.data?.message?.content   // /api/chat
                     ?? response.data?.response;          // /api/generate
  if (ollamaContent) return ollamaContent;

  return null;
}

// Test the LLM configuration
export async function testLLMConfiguration(settings: LLMSettings): Promise<{ success: boolean; message: string }> {
  // Temporarily save current settings
  const originalSettings = llmSettings;
  
  try {
    // Apply test settings
    configureLLM(settings);
    
    // Test message
    const testMessages: LLMMessage[] = [
      { role: 'system', content: settings.systemPrompt },
      { role: 'user', content: 'Hello, this is a test message. Please respond with a short greeting.' }
    ];
    
    // Generate response based on provider
    let response: string | null;
    switch (settings.provider) {
      case 'openai':
        response = await generateOpenAIResponse(testMessages);
        break;
      case 'local':
      case 'custom':
        response = await generateCustomEndpointResponse(testMessages);
        break;
      default:
        throw new Error(`Unsupported LLM provider: ${settings.provider}`);
    }
    
    if (!response) {
      throw new Error('LLM returned empty response');
    }
    
    return {
      success: true,
      message: `Test successful! Response: "${response.substring(0, 50)}${response.length > 50 ? '...' : ''}"`
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Error testing LLM configuration: ${error.message}`
    };
  } finally {
    // Restore original settings
    configureLLM(originalSettings);
  }
}