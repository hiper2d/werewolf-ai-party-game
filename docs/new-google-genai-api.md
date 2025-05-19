# Summary

This is a documentation for the new `@google/genai` SDK

```bash
npm install @google/genai
```

# Initialization

```ts
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY!,  // secure your key server-side
});
```

# Simple Text Generation

```ts
async function generateText() {
  const res = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: "How does AI work?",
  });
  console.log(res.text);
}
generateText();

```

# Advanced Configuration

You can guide model behavior and control outputs via the config object:
```ts
async function guidedGeneration() {
  const res = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: "Hello there",
    config: {
      systemInstruction: "You are a friendly assistant.",
      maxOutputTokens: 200,
      temperature: 0.3,
    },
  });
  console.log(res.text);
}
guidedGeneration();
```

# Structured output

You can configure Gemini for structured output instead of unstructured text, allowing precise extraction and standardization of information for further processing. For example, you can use structured output to extract information from resumes, standardize them to build a structured database.

Gemini can generate either JSON or enum values as structured output.

## Defining a Response Schema

You can generate JSON by configuring a schema on the model (responseSchema) or by supplying a JSON Schema in your prompt. Model-side schemas are recommended to strictly enforce JSON output

### Example: Model-side Schema (JSON)

```ts
interface Person {
  name: string;
  age: number;
  interests: string[];
}

// Generate structured JSON conforming to Person
async function generatePerson() {
  const res = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: "Extract the user profile from the bio.",
    config: {
      responseMimeType: "application/json",
      responseSchema: Person,
    },
  });
  console.log(JSON.parse(res.text) as Person);
}
```

### Example: Prompt-side Schema (enum)

```ts
const schema = {
  type: "string",
  enum: ["red", "green", "blue"],
};

async function pickColor() {
  const res = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: {
      parts: [
        { text: "Choose a color from the list:" },
        { schema },
      ],
    },
    config: { responseMimeType: "text/x.enum" },
  });
  console.log(res.text);  // one of "red", "green", or "blue"
}
```

## Advanced Configuration

- responseMimeType: "application/json" or "text/x.enum"
- propertyOrdering (SDK-only): preserve field order for higher-quality outputs
- Token limits: schema size counts toward input tokens

# Upgrade to the Google Gen AI SDK

A quick migration summary:

> The new Gen AI SDK unifies all Gemini API models (Flash, Pro, Ultra, Live API, Veo, etc.) under a single, consistent interface. You’ll switch your npm package, adjust client initialization, and update calls from GoogleGenerativeAI/getGenerativeModel() to GoogleGenAI/ai.models.

## Install the SDK

```bash
# Before
npm install @google/generative-ai

# After
npm install @google/genai
```

## Authenticate

```ts
// Before
import { GoogleGenerativeAI } from "@google/generative-ai";
const genAI = new GoogleGenerativeAI("YOUR_API_KEY");

// After
import { GoogleGenAI } from "@google/genai";
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
```

## Generate Content

```ts
// Before
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
const result = await model.generateContent("Tell me a story in 300 words.");
console.log(result.response.text());

// After
const response = await ai.models.generateContent({
  model: "gemini-2.0-flash",
  contents: "Tell me a story in 300 words.",
});
console.log(response.text);
```

## Advanced Config & Utilities

- Config object: optional parameters (e.g. temperature, maxOutputTokens, systemInstruction) now live under the config field of generateContent calls.
- Parsed output: structured-output schemas passed via responseSchema are parsed into native JS objects (response.parsed).
- Async support: use await client.aio.models.generateContent(...) for non-blocking calls in TS/JS.

# Gemini API reference

The generateContent method lets you send prompts (text, images, audio, etc.) to a Gemini model and receive generated responses, with optional tooling, safety filters, and system instructions. Use the @google/genai SDK for a concise TS/JS interface or call the REST endpoint directly 

## Endpoint & Path Parameters

```rest
POST https://generativelanguage.googleapis.com/v1beta/{model=models/*}:generateContent
```

Path Parameters:
- **model** (string): Required. The name of the model to use, in the format `models/{model}`

## Request Body Fields

```ts
interface GenerateContentRequest {
  contents: Content[];
  tools?: Tool[];
  toolConfig?: ToolConfig;
  safetySettings?: SafetySetting[];
  systemInstruction?: Content;
  generationConfig?: GenerationConfig;
  cachedContent?: string;
}
```

- contents[] (Content): Required. The current conversation turn(s) to send to the model
- tools[] (Tool): Optional. List of functions or codeExecution tools the model may invoke
- toolConfig (ToolConfig): Optional. Configuration for any specified tools
- safetySettings[] (SafetySetting): Optional. Thresholds for blocking unsafe content categories
- systemInstruction (Content): Optional. A developer-provided system prompt to guide model behavior
- generationConfig (GenerationConfig): Optional. Generation parameters like temperature, maxOutputTokens, etc.
- cachedContent (string): Optional. Use previously cached prompt context by name (cachedContents/{name})

## JavaScript / TypeScript Example

```ts
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY!,  // keep server-side only
});

async function main() {
  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: "Write a short poem about spring.",
    config: {
      systemInstruction: "Be poetic and concise.",
      maxOutputTokens: 100,
      temperature: 0.5,
    },
  });
  console.log(response.text);
}

main();
```

## Response Structure

```ts
interface GenerateContentResponse {
  candidates: Candidate[];
  promptFeedback?: PromptFeedback[];
  metadata: {
    model: string;
    cachedResponse: boolean;
  };
}
```

- candidates[] (Candidate): List of generated outputs. Each has content.parts (text or media), finishReason, and safetyRatings
- promptFeedback[] (PromptFeedback): Feedback on the input prompts (e.g., safety or formatting issues)
- metadata: Contains the model name and cachedResponse flag