import { useContext, useEffect, useRef, useState } from "react";
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

interface StoredCredentials {
  apiBase: string;
  apiKey: string;
}

export function AddModelForm({
  onDone,
  hideFreeTrialLimitMessage,
}: AddModelFormProps) {
  const dispatch = useAppDispatch();
  const { selectedProfile } = useAuth();
  const formMethods = useForm();
  const ideMessenger = useContext(IdeMessengerContext);

  // Helper functions for localStorage management
  const getStoredCredentials = (): StoredCredentials | null => {
    try {
      const stored = localStorage.getItem("neocode-api-credentials");
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.error("Error reading stored credentials:", error);
      return null;
    }
  };

  const storeCredentials = (apiBase: string, apiKey: string) => {
    try {
      const credentials: StoredCredentials = { apiBase, apiKey };
      localStorage.setItem(
        "neocode-api-credentials",
        JSON.stringify(credentials),
      );
    } catch (error) {
      console.error("Error storing credentials:", error);
    }
  };

  const clearStoredCredentials = () => {
    try {
      localStorage.removeItem("neocode-api-credentials");
    } catch (error) {
      console.error("Error clearing credentials:", error);
    }
  };

  // Two-step process state
  const [step, setStep] = useState<"connect" | "selectModel">("connect");
  const [isConnecting, setIsConnecting] = useState(false);
  const [availableModels, setAvailableModels] = useState<Model[]>([]);
  const [selectedCustomModel, setSelectedCustomModel] = useState<Model | null>(
    null,
  );
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [useStoredCredentials, setUseStoredCredentials] = useState(false);
  const successTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Check for stored credentials and auto-fetch models on component mount
  useEffect(() => {
    const storedCreds = getStoredCredentials();
    if (storedCreds && storedCreds.apiBase && storedCreds.apiKey) {
      // Pre-populate form with stored credentials
      formMethods.setValue("apiBase", storedCreds.apiBase);
      formMethods.setValue("apiKey", storedCreds.apiKey);
      setUseStoredCredentials(true);

      // Automatically try to fetch models
      fetchModelsWithCredentials(storedCreds.apiBase, storedCreds.apiKey);
    }
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current);
      }
    };
  }, []);

  async function fetchModelsWithCredentials(apiBase: string, apiKey: string) {
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
        // If stored credentials fail, clear them and show connect step
        if (useStoredCredentials) {
          clearStoredCredentials();
          setUseStoredCredentials(false);
          setStep("connect");
          setConnectionError(
            "Stored credentials are invalid. Please re-enter your details.",
          );
          return;
        }
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

        // Only show success message if not using stored credentials (to avoid showing it automatically)
        if (!useStoredCredentials) {
          setShowSuccessMessage(true);

          // Clear any existing timeout
          if (successTimeoutRef.current) {
            clearTimeout(successTimeoutRef.current);
          }

          // Hide success message after 3 seconds
          successTimeoutRef.current = setTimeout(() => {
            setShowSuccessMessage(false);
            successTimeoutRef.current = null;
          }, 3000);
        }

        // Store credentials for future use (only if not already stored)
        if (!useStoredCredentials) {
          storeCredentials(apiBase, apiKey);
        }

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

  async function fetchModels() {
    const apiBase = formMethods.watch("apiBase");
    const apiKey = formMethods.watch("apiKey");

    setUseStoredCredentials(false); // Mark as user-initiated
    await fetchModelsWithCredentials(apiBase, apiKey);
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
    // Clear any pending timeout
    if (successTimeoutRef.current) {
      clearTimeout(successTimeoutRef.current);
      successTimeoutRef.current = null;
    }

    setStep("connect");
    setAvailableModels([]);
    setSelectedCustomModel(null);
    setConnectionError(null);
    setShowSuccessMessage(false);
    setUseStoredCredentials(false);

    // Keep the stored credentials in the form for convenience
    const storedCreds = getStoredCredentials();
    if (storedCreds) {
      formMethods.setValue("apiBase", storedCreds.apiBase);
      formMethods.setValue("apiKey", storedCreds.apiKey);
    }
  }

  return (
    <FormProvider {...formMethods}>
      <form onSubmit={formMethods.handleSubmit(onSubmit)}>
        <div className="mx-auto max-w-md p-6">
          <h1 className="mb-0 text-center text-2xl">
            {step === "connect"
              ? getStoredCredentials()
                ? "Add Another Model"
                : "Connect to NeoCode"
              : "Select Model"}
          </h1>

          <div className="my-8 flex flex-col gap-6">
            {step === "connect" && (
              <>
                {getStoredCredentials() && (
                  <div className="rounded-lg bg-blue-50 p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h3 className="text-sm font-medium text-blue-800">
                          Saved Credentials Found
                        </h3>
                        <p className="mt-1 text-xs text-blue-700">
                          Using previously saved API credentials. You can modify
                          them below if needed.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          clearStoredCredentials();
                          formMethods.setValue("apiBase", "");
                          formMethods.setValue("apiKey", "");
                        }}
                        className="ml-2 text-xs text-blue-600 underline hover:text-blue-800"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                )}

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
                {showSuccessMessage && (
                  <div className="animate-fade-in rounded-lg bg-green-50 p-4">
                    <div className="flex justify-center">
                      <h3 className="text-sm font-medium text-green-800">
                        Connected Successfully!
                      </h3>
                    </div>
                  </div>
                )}

                {isConnecting && (
                  <div className="rounded-lg bg-blue-50 p-4">
                    <div className="flex items-center justify-center gap-2">
                      <svg
                        className="h-4 w-4 animate-spin text-blue-600"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                      <span className="text-sm text-blue-700">
                        Loading models from your provider...
                      </span>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-lg font-medium">
                    Select a Model ⬇️:
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
              <>
                <Button
                  type="button"
                  onClick={goBackToConnect}
                  className="border-1 mt-2 w-full border-gray-200 text-gray-200"
                >
                  ← Back to Connection
                </Button>
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
              </>
            )}
          </div>
        </div>
      </form>
    </FormProvider>
  );
}

export default AddModelForm;
