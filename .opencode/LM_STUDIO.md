# LM Studio Setup

PMI Agent uses [LM Studio](https://lmstudio.ai) as its local AI provider.

## Requirements

- LM Studio installed and running on your machine
- LM Studio's local server enabled (default port: `1234`)

## How to add your models

1. Open LM Studio and download a model of your choice
2. Start the local server in LM Studio (green **Start Server** button)
3. Open PMI Agent — your loaded model will appear automatically in the model selector

## Server URL

PMI Agent connects to LM Studio at:

```
http://127.0.0.1:1234/v1
```

This is the default LM Studio server address. If you changed the port in LM Studio settings, update it here in `opencode.json` under `provider.lmstudio.options.baseURL`.
