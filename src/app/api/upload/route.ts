import { prisma } from "@/lib/prisma";
import admin from "firebase-admin";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

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

// --- Config ---
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg",
  "image/jpg",
];

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const userId = formData.get("userId") as string | null; // 👈 receive userId from client

    if (!file || !userId) {
      return NextResponse.json(
        { error: "Missing file or userId" },
        { status: 400 },
      );
    }

    // --- Validate file size ---
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large. Max size is 10MB." },
        { status: 400 },
      );
    }

    // --- Validate file type ---
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${file.type}` },
        { status: 400 },
      );
    }

    // --- Prepare file for upload ---
    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = `${Date.now()}-${uuidv4()}-${file.name}`;
    const destinationPath = `uploads/${fileName}`;
    const fileRef = bucket.file(destinationPath);

    // --- Upload to Firebase ---
    await fileRef.save(buffer, {
      metadata: { contentType: file.type },
      resumable: false,
    });

    // --- Signed URL ---
    const [signedUrl] = await fileRef.getSignedUrl({
      action: "read",
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });

    // --- Save in Mongo (Prisma) ---
    const uploadedFile = await prisma.uploadedFile.create({
      data: {
        userId,
        filename: fileName,
        fileType: file.type,
        size: file.size,
        url: signedUrl,
        meta: {
          originalName: file.name,
          storagePath: destinationPath,
        },
      },
    });

    return NextResponse.json(uploadedFile);
  } catch (error) {
    console.error("[API /upload] Upload error:", error);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 },
    );
  }
}
