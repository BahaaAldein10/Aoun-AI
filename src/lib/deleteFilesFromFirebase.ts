import admin from "firebase-admin";

// --- Firebase Admin Initialization ---
if (!admin.apps.length) {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    });
  } else {
    admin.initializeApp({
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    });
  }
}

const bucket = admin.storage().bucket();

export async function deleteFilesFromFirebase(paths: string[]) {
  try {
    await Promise.all(
      paths.map(async (path) => {
        console.log("[Deleting from Firebase]:", path);
        const fileRef = bucket.file(path);
        const [exists] = await fileRef.exists();

        try {
          if (!exists) {
            console.warn(`File does not exist in bucket: ${path}`);
          } else {
            await fileRef.delete();
            console.log(`Deleted from bucket: ${path}`);
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (err: any) {
          if (err.code === 404) {
            console.warn(`File not found in bucket: ${path}`);
          } else {
            console.error(`Failed to delete ${path}`, err);
            throw err;
          }
        }
      }),
    );
  } catch (error) {
    console.error("[Firebase deleteFiles] Error:", error);
    throw error;
  }
}
