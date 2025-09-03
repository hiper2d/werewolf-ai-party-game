# Grok4 Reasoning

grok-4 is reasoning-only model.

`presencePenalty`, `frequencyPenalty` and `stop` parameters are not supported by reasoning models. Adding them in the request would result in error.

Key Features
- Think Before Responding: Thinks through problems step-by-step before delivering an answer.
- Math & Quantitative Strength: Excels at numerical challenges and logic puzzles.
- Reasoning Trace: The model's thoughts are available via the `reasoning_content` field in the response completion object (see example below).

You can access the model's raw thinking trace via the `message.reasoning_content` of the chat completion response. `grok-4` does not return `reasoning_content`.

## Usage Example

Here’s a simple example using `grok-4` to multiply 101 by 3. Notice that we can access both the reasoning content and final response.

```javascript
import OpenAI from "openai";

const client = new OpenAI({
    apiKey: "<api key>",
    baseURL: "https://api.x.ai/v1",
    timeout: 360000,  // Override default timeout with longer timeout for reasoning models
});

const completion = await client.chat.completions.create({
    model: "grok-4",
    messages: [
        {
          "role": "system",
          "content": "You are a highly intelligent AI assistant.",
        },
        {
          "role": "user",
          "content": "What is 101*3?",
        },
    ],
});

console.log("Reasoning Content:", completion.choices[0].message.reasoning_content);

console.log("\nFinal Response:", completion.choices[0].message.content);

console.log("\nNumber of completion tokens (input):", completion.usage.completion_tokens);

console.log("\nNumber of reasoning tokens (input):", completion.usage.completion_tokens_details.reasoning_tokens);
```

## Sample Output

```txt
Reasoning Content:

Final Response:
The result of 101 multiplied by 3 is 303.

Number of completion tokens:
14

Number of reasoning tokens:
310
```

