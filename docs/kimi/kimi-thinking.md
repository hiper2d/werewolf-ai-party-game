# Use kimi-thinking-preview Model

The kimi-thinking-preview model is a multimodal reasoning model with both multimodal and general reasoning capabilities provided by Moonshot AI. It is great at diving deep into problems to help tackle more complex challenges. If you run into tough coding issues, math problems, or work-related dilemmas, the kimi-thinking-preview model can be a helpful tool to turn to.

The kimi-thinking-preview model is the newest in the k-series of thinking models. You can easily start using it by simply switching the model to this one：

```bash
$ curl https://api.moonshot.ai/v1/chat/completions \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $MOONSHOT_API_KEY" \
    -d '{
        "model": "kimi-thinking-preview",
        "messages": [
            {"role": "user", "content": "Hi"}
        ]
   }'
{
    "id": "chatcmpl-6810567267ee141b4630dccb",
    "object": "chat.completion",
    "created": 1745901170,
    "model": "kimi-thinking-preview",
    "choices":
    [
        {
            "index": 0,
            "message":
            {
                "role": "assistant",
                "content": "Hello! How can I help you today? 😊",
                "reasoning_content": "The user just greeted me with a simple "Hi." I can tell that they might be looking to start a conversation or just checking in. Since it's a casual greeting, I should respond in a friendly and welcoming way. I want to make sure the user feels comfortable and knows I'm here to help with whatever they might need. I'll keep my response positive and open-ended to invite further conversation."
            },
            "finish_reason": "stop"
        }
    ],
    "usage":
    {
        "prompt_tokens": 8,
        "completion_tokens": 142,
        "total_tokens": 150
    }
}
```
or using openai SDK：
```bash
import os
import openai
 
client = openai.Client(
    base_url="https://api.moonshot.ai/v1",
    api_key=os.getenv("MOONSHOT_API_KEY"),
)
 
stream = client.chat.completions.create(
    model="kimi-thinking-preview",
    messages=[
        {
            "role": "system",
            "content": "You are Kimi.",
        },
        {
            "role": "user",
            "content": "Explain 1+1=2."
        },
    ],
    max_tokens=1024*32,
    stream=True,
)
 
thinking = False
for chunk in stream:
    if chunk.choices:
        choice = chunk.choices[0]
        # Since the OpenAI SDK doesn't supportting output the reasoning process and has no field for it, we can't directly get the custom `reasoning_content` field (which represents Kimi's reasoning process) using `.reasoning_content`. Instead, we have to use `hasattr` and `getattr` to indirectly access this field.
 
        # First, we use `hasattr` to check if the current output includes the `reasoning_content` field. If it does, we then use `getattr` to retrieve and print this field.
        if choice.delta and hasattr(choice.delta, "reasoning_content"):
            if not thinking:
                thinking = True
                print("=============thinking start=============")
            print(getattr(choice.delta, "reasoning_content"), end="")
        if choice.delta and choice.delta.content:
            if thinking:
                thinking = False
                print("\n=============thinking end=============")
            print(choice.delta.content, end="") 
```

We've noticed that when working with the kimi-thinking-preview model, our API responses use the reasoning_content field to show the model's thinking process. Here's what you need to know about the reasoning_content field:
- The OpenAI SDK's ChoiceDelta and ChatCompletionMessage types don't include a reasoning_content field. So, you can't directly access it using .reasoning_content. Instead, check if the field exists with hasattr(obj, "reasoning_content"). If it does, use getattr(obj, "reasoning_content") to get its value.
- If you're using other frameworks or directly integrating via HTTP interfaces, you can directly access the reasoning_content field. It's at the same level as the content field.
- In streaming output scenarios (stream=True), the reasoning_content field will always come before the content field. You can tell if the thinking process (or reasoning) is done by checking if the content field has appeared in your code.
- The tokens in reasoning_content are also limited by the max_tokens parameter. The combined total of tokens in reasoning_content and content should not exceed max_tokens.

## Multi-turn Conversation

When using kimi-thinking-preview for multi-turn conversations, the thought process doesn't need to be included in the model's request context. We'll show how to properly use kimi-thinking-preview for multi-turn conversations through the following example:：

```bash
import os
import openai
 
client = openai.Client(
    base_url="https://api.moonshot.ai/v1",
    api_key=os.getenv("MOONSHOT_API_KEY"),
)
 
messages = [
    {
        "role": "system",
        "content": "You are Kimi.",
    },
]
 
# First-turn Conversation 
messages.append({
    "role": "user",
    "content": "Explain 1+1=2。"
})
completion = client.chat.completions.create(
    model="kimi-thinking-preview",
    messages=messages,
    max_tokens=1024 * 32,
)
 
# Get the result of the first-turn conversation
message = completion.choices[0].message
if hasattr(message, "reasoning_content"):
    print("=============first thinking start=============")
    print(getattr(message, "reasoning_content"))
    print("=============first thinking end=============")
print(message.content)
 
# Remove the reasoning_content from the message and concatenate the message to the context
if hasattr(message, "reasoning_content"):
    delattr(message, "reasoning_content")
messages.append(message)
 
# Second-turn Conversation
messages.append({
    "role": "user",
    "content": "I don't understand.",
})
completion = client.chat.completions.create(
    model="kimi-thinking-preview",
    messages=messages,
    max_tokens=1024 * 32,
)
 
# Get the result of the second-turn conversation
message = completion.choices[0].message
if hasattr(message, "reasoning_content"):
    print("=============second thinking start=============")
    print(getattr(message, "reasoning_content"))
    print("=============second thinking end=============")
print(message.content)
```

Note: If you accidentally include the reasoning_content field in the context, no need to stress. The content of reasoning_content won't count towards the Tokens usage.

## Model Limitations

