import { useContext, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { Button, Input } from "../components";
import ModelSelectionListbox from "../components/modelSelection/ModelSelectionListbox";
import { useAuth } from "../context/Auth";
import { IdeMessengerContext } from "../context/IdeMessenger";
import { useAppDispatch } from "../redux/hooks";
import { updateSelectedModelByRole } from "../redux/thunks/updateSelectedModelByRole";

interface AddModelFormProps {
  onDone: () => void;
  hideFreeTrialLimitMessage?: boolean;
}

interface Model {
  id: string;
  title: string;
  object?: string;
  created?: number;
  owned_by?: string;
}

export function AddModelForm({
  onDone,
  hideFreeTrialLimitMessage,
}: AddModelFormProps) {
  const dispatch = useAppDispatch();
  const { selectedProfile } = useAuth();
  const formMethods = useForm();
  const ideMessenger = useContext(IdeMessengerContext);

  // Two-step process state
  const [step, setStep] = useState<"connect" | "selectModel">("connect");
  const [isConnecting, setIsConnecting] = useState(false);
  const [availableModels, setAvailableModels] = useState<Model[]>([]);
  const [selectedCustomModel, setSelectedCustomModel] = useState<Model | null>(
    null,
  );
  const [connectionError, setConnectionError] = useState<string | null>(null);

  async function fetchModels() {
    const apiBase = formMethods.watch("apiBase");
    const apiKey = formMethods.watch("apiKey");

    if (!apiBase || !apiKey) {
      setConnectionError("Please enter both API base URL and API key");
      return;
    }

    setIsConnecting(true);
    setConnectionError(null);

    try {
      // OpenAI-compatible endpoints use /models
      const modelsUrl = apiBase.endsWith("/")
        ? `${apiBase}models`
        : `${apiBase}/models`;

      const response = await fetch(modelsUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(
          `Failed to fetch models: ${response.status} ${response.statusText}`,
        );
      }

      const data = await response.json();

      if (data.data && Array.isArray(data.data)) {
        // OpenAI-compatible response format
        const models: Model[] = data.data.map((model: any) => ({
          id: model.id,
          title: model.id,
          object: model.object,
          created: model.created,
          owned_by: model.owned_by,
        }));

        setAvailableModels(models);
        setStep("selectModel");

        // Pre-select the first model if available
        if (models.length > 0) {
          setSelectedCustomModel(models[0]);
        }
      } else {
        throw new Error("Invalid response format: expected data array");
      }
    } catch (error) {
      console.error("Error fetching models:", error);
      setConnectionError(
        error instanceof Error ? error.message : "Failed to connect to the API",
      );
    } finally {
      setIsConnecting(false);
    }
  }

  function isConnectDisabled() {
    const apiBase = formMethods.watch("apiBase");
    const apiKey = formMethods.watch("apiKey");
    const hasValidApiBase = apiBase !== undefined && apiBase.length > 0;
    const hasValidApiKey = apiKey !== undefined && apiKey.length > 0;

    return !hasValidApiBase || !hasValidApiKey || isConnecting;
  }

  function isSubmitDisabled() {
    return !selectedCustomModel;
  }

  function onSubmit() {
    if (step === "connect") {
      // Handle the connect step
      fetchModels();
      return;
    }

    // Handle the final submission
    if (!selectedCustomModel) return;

    const apiKey = formMethods.watch("apiKey");
    const apiBase = formMethods.watch("apiBase");

    const model = {
      provider: "openai",
      title: selectedCustomModel.title,
      model: selectedCustomModel.id,
      apiKey: apiKey,
      apiBase: apiBase,
      underlyingProviderName: "custom",
    };

    ideMessenger.post("config/addModel", { model });

    ideMessenger.post("config/openProfile", {
      profileId: "local",
    });

    void dispatch(
      updateSelectedModelByRole({
        selectedProfile,
        role: "chat",
        modelTitle: model.title,
      }),
    );

    onDone();
  }

  function goBackToConnect() {
    setStep("connect");
    setAvailableModels([]);
    setSelectedCustomModel(null);
    setConnectionError(null);
  }

  return (
    <FormProvider {...formMethods}>
      <form onSubmit={formMethods.handleSubmit(onSubmit)}>
        <div className="mx-auto max-w-md p-6">
          <h1 className="mb-0 text-center text-2xl">Connect to NeoCode</h1>

          <div className="my-8 flex flex-col gap-6">
            {step === "connect" && (
              <>
                <div>
                  <label className="block text-sm font-medium">
                    API Base URL
                  </label>
                  <Input
                    id="apiBase"
                    className="w-full"
                    type="text"
                    placeholder="Enter your provider's API base URL"
                    {...formMethods.register("apiBase", { required: true })}
                  />
                  <span className="text-description-muted mt-1 block text-xs">
                    Enter the base URL for your models provider
                  </span>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium">
                    API Key
                  </label>
                  <Input
                    id="apiKey"
                    className="w-full"
                    type="password"
                    placeholder="Enter your API key"
                    {...formMethods.register("apiKey", { required: true })}
                  />
                  <span className="text-description-muted mt-1 block text-xs">
                    Enter the API key required for your models provider
                  </span>
                </div>

                {connectionError && (
                  <div className="rounded-lg bg-red-50 p-4">
                    <div className="flex">
                      <div className="ml-3">
                        <h3 className="text-sm font-medium text-red-800">
                          Connection Error
                        </h3>
                        <div className="mt-2 text-sm text-red-700">
                          <p>{connectionError}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {step === "selectModel" && (
              <>
                <div className="rounded-lg bg-green-50 p-4">
                  <div className="flex">
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-green-800">
                        Connected Successfully!
                      </h3>
                      <div className="mt-2 text-sm text-green-700">
                        <p>
                          Found {availableModels.length} available models.
                          Select one below:
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium">
                    Available Models
                  </label>
                  <ModelSelectionListbox
                    selectedProvider={
                      selectedCustomModel || { title: "Select a model", id: "" }
                    }
                    setSelectedProvider={(val: any) => {
                      const match = availableModels.find(
                        (model) =>
                          model.id === val.id || model.title === val.title,
                      );
                      if (match) {
                        setSelectedCustomModel(match);
                      }
                    }}
                    topOptions={availableModels}
                  />
                  <span className="text-description-muted mt-1 block text-xs">
                    Choose the model you want to use for chat
                  </span>
                </div>

                <div className="mt-4">
                  <Button
                    type="button"
                    onClick={goBackToConnect}
                    className="mb-2 w-full bg-gray-100 text-gray-700 hover:bg-gray-200"
                  >
                    ← Back to Connection
                  </Button>
                </div>
              </>
            )}
          </div>

          <div className="mt-4 w-full">
            <Button
              type="submit"
              className="w-full"
              disabled={
                step === "connect" ? isConnectDisabled() : isSubmitDisabled()
              }
            >
              {step === "connect"
                ? isConnecting
                  ? "Connecting..."
                  : "Connect"
                : "Add Model"}
            </Button>

            {step === "selectModel" && (
              <span className="text-description-muted mt-2 block w-full text-center text-xs">
                This will update your{" "}
                <span
                  className="cursor-pointer underline hover:brightness-125"
                  onClick={() =>
                    ideMessenger.post("config/openProfile", {
                      profileId: undefined,
                    })
                  }
                >
                  config file
                </span>
              </span>
            )}
          </div>
        </div>
      </form>
    </FormProvider>
  );
}

export default AddModelForm;
