import { api } from "./client";
import type {
  AuthUser,
  InventoryEvent,
  PantryItem,
  PantryItemCreate,
  PantryItemUpdate,
  RiskPrediction,
} from "@/types";
import type {
  ReceiptProcessResponse,
  ReceiptScanResponse,
} from "@/types/receipt";
import type {
  RecipeSuggestionRequest,
  RecipeSuggestionResponse,
} from "@/types/recipe";

export type InventoryEventCreatePayload = {
  event_type: "consumed" | "wasted" | "purchased" | "adjusted";
  quantity: number;
  notes?: string;
};

// ---------------- Auth ----------------

export async function login(
  email: string,
  password: string,
) {
  const response = await api.post(
    "/auth/login",
    {
      email,
      password,
    },
  );

  return response.data as {
    access_token?: string;
    token?: string;
    token_type?: string;
    user?: AuthUser;
  };
}

export async function register(
  payload: Record<string, unknown>,
) {
  const response = await api.post(
    "/auth/register",
    payload,
  );

  return response.data;
}

export async function getMe() {
  const response = await api.get(
    "/auth/me",
  );

  return response.data as AuthUser;
}

// ---------------- Pantry ----------------

export async function listPantryItems(): Promise<
  PantryItem[]
> {
  const response = await api.get(
    "/pantry-items",
  );

  const data = response.data;

  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data?.items)) {
    return data.items;
  }

  if (Array.isArray(data?.results)) {
    return data.results;
  }

  return [];
}

export async function getPantryItem(
  id: string,
): Promise<PantryItem> {
  const response = await api.get(
    `/pantry-items/${id}`,
  );

  return response.data as PantryItem;
}

export async function createPantryItem(
  payload: PantryItemCreate,
): Promise<PantryItem> {
  const response = await api.post(
    "/pantry-items",
    payload,
  );

  return response.data as PantryItem;
}

export async function updatePantryItem(
  id: string,
  payload: PantryItemUpdate,
): Promise<PantryItem> {
  const response = await api.patch(
    `/pantry-items/${id}`,
    payload,
  );

  return response.data as PantryItem;
}

export async function deletePantryItem(
  id: string,
): Promise<void> {
  await api.delete(
    `/pantry-items/${id}`,
  );
}

// ---------------- Events ----------------

export async function createInventoryEvent(
  pantryItemId: string,
  payload: InventoryEventCreatePayload,
): Promise<InventoryEvent> {
  const response = await api.post(
    `/pantry-items/${pantryItemId}/events`,
    payload,
  );

  return response.data as InventoryEvent;
}

export async function listInventoryEvents(
  pantryItemId?: string,
): Promise<InventoryEvent[]> {
  const url = pantryItemId
    ? `/pantry-items/${pantryItemId}/events`
    : "/inventory-events";

  try {
    const response = await api.get(url);
    const data = response.data;

    if (Array.isArray(data)) {
      return data;
    }

    if (Array.isArray(data?.items)) {
      return data.items;
    }

    return [];
  } catch {
    return [];
  }
}

// ---------------- Predictions ----------------

export async function getWasteRisk(): Promise<
  RiskPrediction[]
> {
  const response = await api.get(
    "/predictions/waste-risk",
  );

  const data = response.data;

  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data?.items)) {
    return data.items;
  }

  return [];
}

// ---------------- Receipts ----------------

function buildReceiptFormData(
  file: File,
) {
  const formData = new FormData();

  formData.append(
    "file",
    file,
    file.name,
  );

  return formData;
}

export async function scanReceipt(
  file: File,
  onProgress?: (
    progress: number,
  ) => void,
): Promise<ReceiptScanResponse> {
  const response =
    await api.post<ReceiptScanResponse>(
      "/receipts/scan",
      buildReceiptFormData(file),
      {
        headers: {
          "Content-Type":
            "multipart/form-data",
        },
        timeout: 180000,
        onUploadProgress: (event) => {
          if (
            onProgress &&
            event.total
          ) {
            onProgress(
              Math.round(
                (event.loaded /
                  event.total) *
                  100,
              ),
            );
          }
        },
      },
    );

  return response.data;
}

export async function uploadReceipt(
  file: File,
  onProgress?: (
    progress: number,
  ) => void,
): Promise<ReceiptProcessResponse> {
  const response =
    await api.post<ReceiptProcessResponse>(
      "/receipts/process",
      buildReceiptFormData(file),
      {
        headers: {
          "Content-Type":
            "multipart/form-data",
        },
        timeout: 180000,
        onUploadProgress: (event) => {
          if (
            onProgress &&
            event.total
          ) {
            onProgress(
              Math.round(
                (event.loaded /
                  event.total) *
                  100,
              ),
            );
          }
        },
      },
    );

  return response.data;
}

// ---------------- Recommendations ----------------

export async function getGroceryRecommendations() {
  const response = await api.get(
    "/recommendations/grocery",
  );

  return response.data;
}

export async function getRecipeRecommendations(
  payload: RecipeSuggestionRequest,
): Promise<RecipeSuggestionResponse> {
  const response =
    await api.post<RecipeSuggestionResponse>(
      "/recommendations/recipes",
      payload,
      {
        timeout: 180000,
      },
    );

  return response.data;
}