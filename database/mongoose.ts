import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI)
  throw new Error(
    "Please define the MONGODB_URI environment variable",
  );

//since we are using Next.js and accessing db through server action, which is different from having the server connection persistent
//In this case we have to create a cache connection bcz the connection to our server gets destroyed on every new request so instead of recreating that connection to db every time from scratch,
//Instead we can created connection once and then use the one from cache

declare global {
  var mongooseCache: {
    conn: typeof mongoose | null;
    promise: Promise<typeof mongoose> | null;
  };
}

const cached =
  global.mongooseCache ||
  (global.mongooseCache = { conn: null, promise: null });

export const connectToDatabase = async () => {
  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI, {
      bufferCommands: false,
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    console.error(
      "MongoDB connection error, Please make sure MongoDB is running. " +
        e,
    );
    throw e;
  }

  console.info("Connected to MongoDB");
  return cached.conn;
};
