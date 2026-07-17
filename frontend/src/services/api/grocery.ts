import { api } from "./client";
import type {
  GroceryList,
  GroceryListHistoryItem,
  GroceryListItem,
  GroceryListItemCreate,
  GroceryListItemUpdate,
} from "@/types/grocery";

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
    { message },
    { timeout: 120000 },
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