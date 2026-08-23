# Student LLM Gateway Guide

This guide explains how faculty and students use the GPU-backed LLM service on `mmlab-gpu2`.

## Service overview

The service has three layers:

- **vLLM** runs `Qwen/Qwen3-8B` on the RTX 4500 Ada GPU.
- **LiteLLM** authenticates users, applies key restrictions and forwards requests to vLLM.
- **Langfuse** records prompts, responses, latency, token usage and errors.

The public model name is:

```text
my-class-model
```

The primary endpoints are available through the university network:

| Purpose | URL |
| --- | --- |
| OpenAI-compatible API | `http://172.16.22.63:4000/v1` |
| LiteLLM faculty UI | `http://172.16.22.63:4000/ui` |
| Langfuse logging UI | `http://172.16.22.63:3000` |

The vLLM backend and databases are not exposed directly.

Administrators can still use the Tailscale fallback addresses `http://100.103.38.62:4000` and `http://100.103.38.62:3000` when off campus. Students normally use the university LAN address above.

## Before using the service

1. Connect your computer to the university network or university VPN.
2. Open `http://172.16.22.63:4000/ui` to confirm the gateway is reachable.
3. Obtain a student API key from faculty. Do not use or share the faculty master key.

API keys should be treated like passwords. Do not commit them to Git, paste them into notebooks that will be submitted, or include them in screenshots.

## Student quick start

### Python

Install the OpenAI client:

```bash
python -m pip install openai
```

Store the issued key in an environment variable:

```bash
export CLASS_LLM_API_KEY="your-student-key"
```

Use the service:

```python
import os
from openai import OpenAI

client = OpenAI(
    api_key=os.environ["CLASS_LLM_API_KEY"],
    base_url="http://172.16.22.63:4000/v1",
)

response = client.chat.completions.create(
    model="my-class-model",
    messages=[
        {"role": "system", "content": "You are a concise teaching assistant."},
        {"role": "user", "content": "Explain binary search with an example."},
    ],
    temperature=0.2,
    max_tokens=500,
)

print(response.choices[0].message.content)
```

### curl

```bash
curl http://172.16.22.63:4000/v1/chat/completions \
  -H "Authorization: Bearer $CLASS_LLM_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "my-class-model",
    "messages": [
      {"role": "user", "content": "Explain binary search."}
    ],
    "max_tokens": 500,
    "temperature": 0.2
  }'
```

### Streaming responses

```python
stream = client.chat.completions.create(
    model="my-class-model",
    messages=[{"role": "user", "content": "Write a short sorting tutorial."}],
    stream=True,
    max_tokens=700,
)

for chunk in stream:
    text = chunk.choices[0].delta.content
    if text:
        print(text, end="", flush=True)
```

## Qwen thinking output

Qwen3 may use part of the token allowance for reasoning and may return `<think>...</think>` content. If a response stops during its reasoning, increase `max_tokens`. Applications that show answers to end users may also strip the thinking block before display.

Do not assume hidden or displayed reasoning is correct. Validate important results independently.

## Faculty: sign in and create student keys

Faculty credentials are stored on the server at:

```text
/opt/llm-gateway/credentials.txt
```

Read them after connecting to the server:

```bash
ssh suryavir@mmlab-gpu2
cat /opt/llm-gateway/credentials.txt
```

Then:

1. Open `http://172.16.22.63:4000/ui`.
2. Sign in using the LiteLLM master key.
3. Open the virtual-key management page.
4. Create one key per student or project.
5. Restrict the key to `my-class-model`.
6. Set an expiry date, requests-per-minute (RPM), tokens-per-minute (TPM), and any desired parallel-request limit.
7. Give the key to the student through an approved private channel.

Suggested starting limits for normal coursework are 10 RPM and 20,000 TPM. Lower them for large classes if interactive latency becomes poor.

The local model currently has no monetary provider price. Token and request limits work, but monetary budget limits require faculty to configure synthetic input/output token prices in LiteLLM first.

## Faculty: inspect prompt and response logs

1. Open `http://172.16.22.63:3000`.
2. Sign in with the Langfuse faculty account stored in `credentials.txt`.
3. Open the **Student LLM Gateway** project.
4. Use the traces view to inspect prompts, responses, latency, token use and failures.

All users must be informed that their prompts and model responses are logged. Students should not submit passwords, API keys, private personal data, unpublished research data, or other sensitive material unless institutional policy explicitly allows it.

## Common errors

### Connection refused or timeout

- Confirm the computer is on the university network or university VPN.
- Confirm `mmlab-gpu2` is online.
- Confirm the URL uses `172.16.22.63`, not the vLLM port.

### 401 Unauthorized

- Check that the student key is present and has no extra spaces.
- Make sure the `Authorization` header starts with `Bearer `.
- Ask faculty whether the key expired or was revoked.

### 429 Too Many Requests

The key exceeded its RPM, TPM, or concurrency limit. Wait and retry with exponential backoff. Do not run an aggressive retry loop.

### Model not found

Use exactly:

```text
my-class-model
```

### Response ends early

Increase `max_tokens`. Qwen's thinking output can consume a substantial part of a small token allowance.

## Server operations

Run these commands on `mmlab-gpu2`.

Check the core services:

```bash
cd /opt/llm-gateway
docker compose ps
docker compose logs --tail=100 vllm litellm
nvidia-smi
```

Check Langfuse:

```bash
cd /opt/llm-gateway/langfuse-src
docker compose -f docker-compose.yml -f compose.override.yaml ps
docker compose -f docker-compose.yml -f compose.override.yaml logs --tail=100 langfuse-web langfuse-worker
```

Restart the gateway without deleting data:

```bash
cd /opt/llm-gateway
docker compose restart
```

Restart Langfuse without deleting data:

```bash
cd /opt/llm-gateway/langfuse-src
docker compose -f docker-compose.yml -f compose.override.yaml restart
```

Do not run `docker compose down -v`; the `-v` option deletes persistent database, model-cache and logging volumes.

## Security and maintenance

- Rotate the faculty master key and UI password if either is disclosed.
- Revoke lost or exposed student keys immediately.
- Keep access limited to the private university network, university VPN, Tailscale, or an authenticated TLS ingress.
- Back up the LiteLLM PostgreSQL and Langfuse persistent volumes.
- Review disk usage periodically because prompt logs and model caches grow over time.
- Test upgrades before changing the pinned environment used during a course.

The deployment files are under `/opt/llm-gateway`, and all secrets are stored in files readable only by the deployment owner.
