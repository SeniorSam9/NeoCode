import { ConfigYaml } from "@continuedev/config-yaml";

export const defaultConfig: ConfigYaml = {
  name: "NeoCode",
  version: "1.0.0",
  schema: "v1",
  models: [
    {
      name: "LLaMA 3 (Local)",
      provider: "ollama",
      model: "llama3",
      apiBase: "http://localhost:11434",
      apiKey: "",
    },
  ],
};
