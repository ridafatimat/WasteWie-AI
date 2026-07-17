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
  GroceryList,
  GroceryListHistoryItem,
  GroceryListItem,
  GroceryListItemCreate,
  GroceryListItemUpdate,
} from "@/types/grocery";
import type {
  ReceiptProcessResponse,
  ReceiptScanResponse,
} from "@/types/receipt";

// ---------------- Auth ----------------

export async function login(email: string, password: string) {
  const response = await api.post("/auth/login", {
    email,
    password,
  });

  return response.data as {
    access_token?: string;
    token?: string;
    token_type?: string;
    user?: AuthUser;
  };
}

export async function register(payload: Record<string, unknown>) {
  const response = await api.post("/auth/register", payload);

  return response.data;
}

export async function getMe() {
  const response = await api.get("/auth/me");

  return response.data as AuthUser;
}

// ---------------- Pantry ----------------

export async function listPantryItems(): Promise<PantryItem[]> {
  const response = await api.get("/pantry-items");

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

export async function getPantryItem(id: string): Promise<PantryItem> {
  const response = await api.get(`/pantry-items/${id}`);

  return response.data as PantryItem;
}

export async function createPantryItem(
  payload: PantryItemCreate,
): Promise<PantryItem> {
  const response = await api.post("/pantry-items", payload);

  return response.data as PantryItem;
}

export async function updatePantryItem(
  id: string,
  payload: PantryItemUpdate,
): Promise<PantryItem> {
  const response = await api.patch(`/pantry-items/${id}`, payload);

  return response.data as PantryItem;
}

export async function deletePantryItem(id: string) {
  await api.delete(`/pantry-items/${id}`);
}

// ---------------- Events ----------------

export async function createInventoryEvent(
  pantryItemId: string,
  payload: InventoryEvent,
) {
  const response = await api.post(
    `/pantry-items/${pantryItemId}/events`,
    payload,
  );

  return response.data;
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

export async function getWasteRisk(): Promise<RiskPrediction[]> {
  const response = await api.get("/predictions/waste-risk");

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

function buildReceiptFormData(file: File) {
  const formData = new FormData();

  formData.append("file", file, file.name);

  return formData;
}

export async function scanReceipt(
  file: File,
  onProgress?: (progress: number) => void,
): Promise<ReceiptScanResponse> {
  const response = await api.post<ReceiptScanResponse>(
    "/receipts/scan",
    buildReceiptFormData(file),
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
      timeout: 180000,
      onUploadProgress: (event) => {
        if (onProgress && event.total) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      },
    },
  );

  return response.data;
}

export async function uploadReceipt(
  file: File,
  onProgress?: (progress: number) => void,
): Promise<ReceiptProcessResponse> {
  const response = await api.post<ReceiptProcessResponse>(
    "/receipts/process",
    buildReceiptFormData(file),
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
      timeout: 180000,
      onUploadProgress: (event) => {
        if (onProgress && event.total) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      },
    },
  );

  return response.data;
}

// ---------------- Grocery lists ----------------

export async function getActiveGroceryList(): Promise<GroceryList | null> {
  const response = await api.get<GroceryList | null>("/grocery-lists/active");

  return response.data;
}

export async function generateGroceryList(
  coverageDays: number,
): Promise<GroceryList> {
  const response = await api.post<GroceryList>("/grocery-lists/generate", {
    coverage_days: coverageDays,
  });

  return response.data;
}

export async function getGroceryList(listId: string): Promise<GroceryList> {
  const response = await api.get<GroceryList>(`/grocery-lists/${listId}`);

  return response.data;
}

export async function addMealToGroceryList(
  listId: string,
  message: string,
): Promise<GroceryList> {
  const response = await api.post<GroceryList>(
    `/grocery-lists/${listId}/meals`,
    {
      message,
    },
    {
      timeout: 120000,
    },
  );

  return response.data;
}

export async function removeMealFromGroceryList(
  listId: string,
  mealId: string,
): Promise<GroceryList> {
  const response = await api.delete<GroceryList>(
    `/grocery-lists/${listId}/meals/${mealId}`,
  );

  return response.data;
}

export async function addGroceryListItem(
  listId: string,
  payload: GroceryListItemCreate,
): Promise<GroceryListItem> {
  const response = await api.post<GroceryListItem>(
    `/grocery-lists/${listId}/items`,
    payload,
  );

  return response.data;
}

export async function updateGroceryListItem(
  listId: string,
  itemId: string,
  payload: GroceryListItemUpdate,
): Promise<GroceryListItem> {
  const response = await api.patch<GroceryListItem>(
    `/grocery-lists/${listId}/items/${itemId}`,
    payload,
  );

  return response.data;
}

export async function deleteGroceryListItem(
  listId: string,
  itemId: string,
): Promise<void> {
  await api.delete(`/grocery-lists/${listId}/items/${itemId}`);
}

export async function startGroceryShopping(
  listId: string,
): Promise<GroceryList> {
  const response = await api.post<GroceryList>(
    `/grocery-lists/${listId}/start-shopping`,
  );

  return response.data;
}

export async function completeGroceryList(
  listId: string,
): Promise<GroceryList> {
  const response = await api.post<GroceryList>(
    `/grocery-lists/${listId}/complete`,
  );

  return response.data;
}

export async function getGroceryListHistory(): Promise<
  GroceryListHistoryItem[]
> {
  const response = await api.get<GroceryListHistoryItem[]>(
    "/grocery-lists/history",
  );

  return Array.isArray(response.data) ? response.data : [];
}

// Keep these exports temporarily so older pages do not break.
export async function getGroceryRecommendations() {
  return getActiveGroceryList();
}

export async function getRecipeRecommendations(
  payload: Record<string, unknown> = {},
) {
  const activeList = await getActiveGroceryList();

  if (!activeList) {
    throw new Error("Generate a grocery list before adding a planned meal.");
  }

  const message = String(
    payload.message ?? payload.prompt ?? payload.meal ?? "",
  ).trim();

  if (!message) {
    throw new Error("Enter a meal plan first.");
  }

  return addMealToGroceryList(activeList.id, message);
}