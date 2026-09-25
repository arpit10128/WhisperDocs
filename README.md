# WhisperDocs

WhisperDocs is a voice-first AI platform that lets you upload PDFs and have natural, real-time conversations with their content. It combines document processing, secure storage, and voice AI to turn static documents into interactive conversations.

## ✨ Features

- 📄 **PDF Upload & Processing**: Upload PDFs and extract their content directly in the browser.
- 🎙️ **Voice Conversations**: Ask questions about your documents using your voice and receive spoken responses.
- 🔎 **Document-Grounded Answers**: Retrieve relevant document content to provide context-aware responses.
- 🔐 **Secure Authentication**: User authentication and session management with Clerk.
- ☁️ **Cloud File Storage**: Store PDFs and cover images using Vercel Blob.
- 🗄️ **Persistent Document Data**: Store document metadata, chunks, and voice sessions with MongoDB and Mongoose.
- 🔒 **Secure Document Access**: HMAC-signed document tokens protect Vapi tool calls from unauthorized document access.
- 🧹 **Failure Recovery**: Rollback and orphan-file cleanup prevent inconsistent database and storage state.
- 📱 **Responsive Interface**: Built with Next.js, React, and Tailwind CSS for a responsive document experience.

## 🛠️ Tech Stack

### Frontend
- Next.js 16
- React 19
- TypeScript
- Tailwind CSS
- pdfjs-dist

### Backend & Database
- Next.js Server Actions & API Routes
- Node.js
- MongoDB
- Mongoose

### Authentication & Storage
- Clerk
- Vercel Blob

### Voice AI
- Vapi
- ElevenLabs
- Vapi Web SDK

## 🚀 Getting Started

Follow the steps below to set up WhisperDocs locally.

### 1. Clone the Repository

`git clone https://github.com/your-username/whisperdocs.git
cd whisperdocs`

### 2. Install Dependencies

Install the project dependencies using your preferred package manager:

```
npm install
# or
yarn install
# or
pnpm install
# or
bun install
```

### 3. Configure Environment Variables

Create a `.env.local` file in the root directory of the project and add the required environment variables:

```env
# Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=

# Database
MONGODB_URI=

# File Storage
BLOB_READ_WRITE_TOKEN=

# Voice AI
NEXT_PUBLIC_ASSISTANT_ID=
NEXT_PUBLIC_VAPI_API_KEY=
VAPI_SERVER_SECRET=
VAPI_DOCUMENT_TOKEN_SECRET=
```

### 4. Configure Vapi

WhisperDocs uses Vapi for its voice AI functionality.

Before running the application, configure your Vapi assistant from the Vapi Dashboard:

1. Create an account or log in to the Vapi Dashboard.
2. Create a new assistant.
3. Configure the assistant with the voice, model, and other settings required by WhisperDocs.
4. Add the document search/tool configuration used by the application.
5. Copy the Assistant ID and add it to:
`NEXT_PUBLIC_ASSISTANT_ID=your_assistant_id`
6. Get your Vapi API key and add it to:
`NEXT_PUBLIC_VAPI_API_KEY=your_vapi_api_key`
7. Configure the required server-side Vapi credentials:
```
VAPI_SERVER_SECRET=your_vapi_server_secret
VAPI_DOCUMENT_TOKEN_SECRET=your_document_token_secret
```

Important: Never expose server-side secrets such as VAPI_SERVER_SECRET or VAPI_DOCUMENT_TOKEN_SECRET in client-side code or commit them to Git.

### 5. Open the Application

Start the Next.js development server:
```
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```
Once the development server is running, open the application in your browser:

http://localhost:3000

You should now have WhisperDocs running locally.

## 🏗️ Architecture & Engineering

Detailed documentation covering the system architecture,
design trade-offs, security, testing, and planned scalability improvements.

[Read the WhisperDocs Architecture Documentation](https://www.notion.so/WhisperDocs-Engineering-Architecture-3e6f871abf1a8110bf48c7405f8e90ce?source=copy_link)

## WhisperDocs V1 System design
<img width="926" height="278" alt="Screenshot 2026-09-25 124013" src="https://github.com/user-attachments/assets/a746fcfa-da03-4aba-bfd7-c706c9d71df8" />
<img width="930" height="320" alt="Screenshot 2026-09-25 124043" src="https://github.com/user-attachments/assets/69a85693-c23f-4434-b24d-f3abdf68b2d6" />
<img width="910" height="304" alt="Screenshot 2026-09-25 124453" src="https://github.com/user-attachments/assets/8250de86-f6c2-4915-a2e8-f4663235197a" />

## PDF upload flow
<img width="500" height="299" alt="Screenshot 2026-09-25 125550" src="https://github.com/user-attachments/assets/62b08323-6f9e-45bc-afb2-f11fdcc658e0" />

## Voice session flow
<img width="488" height="368" alt="Screenshot 2026-09-25 125558" src="https://github.com/user-attachments/assets/d4c9cbd7-4aa2-465c-ac11-744d9df4e294" />
