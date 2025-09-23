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
