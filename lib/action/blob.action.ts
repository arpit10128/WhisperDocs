export async function deleteBlob(blobId: string) {
  try {
    const response = await fetch("/api/blob", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        blobId,
      }),
    });

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({}));
      throw new Error(
        errorData.error || "Blob cleanup failed",
      );
    }

    console.log("Orphaned blob successfully deleted.");
    return { success: true };
  } catch (deleteError) {
    console.error(
      `Failed to delete orphaned blob: `,
      deleteError,
    );
    throw deleteError;
  }
}
