import admin from "firebase-admin";

const bucket = admin.storage().bucket();

export async function deleteFilesFromFirebase(paths: string[]) {
  try {
    await Promise.all(
      paths.map(async (path) => {
        const fileRef = bucket.file(path);
        await fileRef.delete().catch((err) => {
          if (err.code === 404) {
            console.warn(`File not found in bucket: ${path}`);
          } else {
            throw err;
          }
        });
      }),
    );
  } catch (error) {
    console.error("[Firebase deleteFiles] Error:", error);
    throw error;
  }
}
