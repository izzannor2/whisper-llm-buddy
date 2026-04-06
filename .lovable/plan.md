

# Wire Up File Attachments (Paperclip Button)

## What's Changing
The Paperclip button currently does nothing. We'll make it open a file picker, attach files to your message, display previews, and send images to the AI for analysis. Non-image files (zip, code, text) get their content extracted and included as text context.

## How It Works

### 1. ChatInput — File picker + preview strip
**File: `src/components/ChatInput.tsx`**
- Add a hidden `<input type="file" multiple>` triggered by the Paperclip button
- Accept images (png, jpg, gif, webp), text files (txt, md, json, js, ts, py, css, html, xml, yaml), and archives (zip — show name only)
- Store attachments in state as `{ name, type, dataUrl, textContent }[]`
- Show a preview strip above the textarea: image thumbnails with X buttons, file chips for non-images
- New prop `onSendWithAttachments` that passes `(message, attachments, isPlan)` to Index
- On send, clear attachments

### 2. Chat API — Multimodal content support
**File: `src/lib/chat-api.ts`**
- Update `ChatMessage.content` type to `string | Array<{type: string, text?: string, image_url?: {url: string}}>` 
- When attachments include images, format the user message as a multimodal content array (text + image_url parts) — the Gemini gateway already supports this format
- For text files, prepend file contents as context in the text part
- For zip/binary files, just mention the filename in the text

### 3. Message Display — Show images inline
**File: `src/components/ChatMessage.tsx`**
- Detect if `message.content` contains base64 image data URLs or `[ATTACHMENT:filename]` markers
- Render inline image previews for image attachments
- Show file name badges for non-image attachments

### 4. Index — Pass handler through
**File: `src/pages/Index.tsx`**
- Update `handleSendMessage` to accept optional attachments array
- When attachments present, build multimodal `ChatMessage` content before sending to `sendChatMessage`
- Store a simplified version in the conversation (image thumbnails or markers) to avoid bloating IndexedDB

### 5. DB Message type update
**File: `src/lib/db.ts`**
- Add optional `attachments?: { name: string; type: string; dataUrl?: string }[]` field to `Message` interface
- Existing messages without attachments continue working unchanged

## Files to Modify
- `src/components/ChatInput.tsx` — File input, preview strip, send with attachments
- `src/lib/chat-api.ts` — Multimodal content type support
- `src/components/ChatMessage.tsx` — Render image/file attachments inline
- `src/pages/Index.tsx` — Wire attachment handler into send flow
- `src/lib/db.ts` — Add attachments field to Message type

## Limitations
- Images are sent as base64 data URLs (works with Gemini vision models)
- Large files (>5MB) will show a warning and be skipped to avoid memory issues
- ZIP files can't be analyzed in-browser — AI gets told the filename only
- Text files get their full content injected as context for AI analysis

