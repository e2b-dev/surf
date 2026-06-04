![E2B Surf Preview Light](/readme-assets/surf-light.png#gh-light-mode-only)
![E2B Surf Preview Dark](/readme-assets/surf-dark.png#gh-dark-mode-only)

# 🏄 Surf - OpenAI's Computer Use Agent + E2B Desktop

A Next.js application that allows AI to interact with a virtual desktop environment. This project integrates [E2B's desktop sandbox](https://github.com/e2b-dev/desktop) with OpenAI's API to create an AI agent that can perform tasks on a virtual computer through natural language instructions.

[E2B](https://e2b.dev) is an open source isolated virtual computer in the cloud made for AI use cases.

## Overview

The Computer Use App provides a web interface where users can:

1. Start a virtual desktop sandbox environment
2. Send natural language instructions to an AI agent
3. Watch as the AI agent performs actions on the virtual desktop
4. Interact with the AI through a chat interface

The application uses Server-Sent Events (SSE) to stream AI responses and actions in real-time, providing a seamless experience.

## How It Works

### Architecture

The application consists of several key components:

1. **Frontend UI (Next.js)**: Provides the user interface with a virtual desktop view and chat interface
2. [**E2B Desktop Sandbox**](https://github.com/e2b-dev/desktop): Creates and manages virtual desktop environments
3. [**OpenAI Computer Use**](https://platform.openai.com/docs/guides/tools-computer-use): Processes user instructions and generates actions for the AI agent
4. **Streaming API**: Handles real-time communication between the frontend and backend

### Core Flow

1. User starts a new sandbox instance
2. E2B creates a virtual desktop and provides a URL for streaming
3. User sends instructions via the chat interface
4. Backend processes the instructions using OpenAI's API
5. AI generates actions (clicks, typing, etc.) to perform on the virtual desktop
6. Actions are executed on the sandbox and streamed back to the frontend
7. The process repeats as the user continues to provide instructions

## Prerequisites

Before starting, you'll need:

1. [Node.js](https://nodejs.org/) (version specified in package.json)
2. [npm](https://www.npmjs.com/) (comes with Node.js)
3. An [E2B API key](https://e2b.dev/docs/getting-started/api-key)
4. An [OpenAI API key](https://platform.openai.com/api-keys)

## Setup Instructions

1. **Clone the repository**
```bash
git clone https://github.com/e2b-dev/surf
cd surf
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up environment variables**

Create a `.env.local` file in the root directory based on the provided `.env.example`:

```env
E2B_API_KEY=your_e2b_api_key
OPENAI_API_KEY=your_openai_api_key
```

4. **Start the development server**
```bash
npm run dev
```

5. **Open the application**

Navigate to [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

1. **Start a Sandbox Instance**
   - Click the "Start new Sandbox" button to initialize a virtual desktop environment
   - Wait for the sandbox to start (this may take a few seconds)

2. **Send Instructions**
   - Type your instructions in the chat input (e.g., "Open Firefox and go to google.com")
   - Press Enter or click the send button
   - You can also select from example prompts if available

3. **Watch AI Actions**
   - The AI will process your instructions and perform actions on the virtual desktop
   - You can see the AI's reasoning and actions in the chat interface
   - The virtual desktop will update in real-time as actions are performed

4. **Manage the Sandbox**
   - The timer shows the remaining time for your sandbox instance
   - You can stop the sandbox at any time by clicking the "Stop" button
   - The sandbox will automatically extend its time when it's about to expire

## Features

- **Virtual Desktop Environment**: Runs a Linux-based desktop in a sandbox
- **AI-Powered Interaction**: Uses OpenAI's API to understand and execute user instructions
- **Real-Time Streaming**: Shows AI actions and responses as they happen
- **Chat Interface**: Provides a conversational interface for interacting with the AI
- **Example Prompts**: Offers pre-defined instructions to help users get started
- **Dark/Light Mode**: Supports both dark and light themes

## Technical Details

### Dependencies

The application uses several key dependencies:

- **Next.js**: React framework for the frontend
- **@e2b/desktop**: SDK for creating and managing desktop sandbox environments
- **OpenAI**: SDK for interacting with OpenAI's API
- **Tailwind CSS**: Utility-first CSS framework for styling
- **Framer Motion**: Library for animations

See `package.json` for a complete list of dependencies.

### API Endpoints

- **/api/chat**: Handles chat messages and streams AI responses and actions

### Server Actions

- **createSandbox**: Creates a new sandbox instance
- **increaseTimeout**: Extends the sandbox timeout
- **stopSandboxAction**: Stops a running sandbox instance

## Troubleshooting

- **Sandbox not starting**: Verify your E2B API key is correct in `.env.local`
- **AI not responding**: Check that your OpenAI API key is valid and has access to the required models
- **Actions not working**: Ensure the sandbox is running and the AI has proper instructions

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

## Support

If you encounter any issues or have questions:
- Check the [E2B Documentation](https://e2b.dev/docs)
- Join the [E2B Discord](https://discord.gg/U7KEcGErtQ)
- Open an [issue](https://github.com/e2b-dev/computer-use-app/issues)


## FAQ

### What is Surf?

**Surf** is a Next.js application that integrates [E2B's desktop sandbox](https://github.com/e2b-dev/desktop) with [OpenAI's Computer Use API](https://platform.openai.com/docs/guides/tools-computer-use). It allows AI agents to interact with a virtual desktop environment through natural language instructions.

| Feature | Description |
|---------|-------------|
| Virtual Desktop | E2B sandbox creates isolated desktop environments |
| AI Agent | OpenAI processes instructions and generates actions |
| SSE Streaming | Real-time streaming of AI responses and actions |
| Chat Interface | Conversational UI for sending instructions |
| Dark/Light Mode | Theme support for user preference |

### How do I get started?

1. Clone and install:
```bash
git clone https://github.com/e2b-dev/surf
cd surf && npm install
```

2. Set up API keys in `.env.local`:
```env
E2B_API_KEY=your_e2b_api_key
OPENAI_API_KEY=your_openai_api_key
```

3. Run the dev server:
```bash
npm run dev
```

4. Open http://localhost:3000 and click "Start new Sandbox"

### What are the core components?

| Component | Role |
|-----------|------|
| Frontend UI (Next.js) | Virtual desktop view + chat interface |
| E2B Desktop Sandbox | Creates/manages virtual desktop environments |
| OpenAI Computer Use | Processes instructions and generates actions |
| Streaming API (SSE) | Real-time frontend-backend communication |

### What dependencies does Surf use?

| Dependency | Purpose |
|------------|---------|
| Next.js | React framework for frontend |
| @e2b/desktop | SDK for desktop sandbox environments |
| OpenAI SDK | API for AI interactions |
| Tailwind CSS | Utility-first CSS styling |
| Framer Motion | Animation library |

### What API endpoints are available?

| Endpoint | Function |
|----------|----------|
| /api/chat | Handles chat messages, streams AI responses |
| createSandbox | Server action to create sandbox instance |
| increaseTimeout | Extends sandbox timeout duration |
| stopSandboxAction | Stops running sandbox instance |

### Is Surf free and open source?

Yes! Surf is **Apache 2.0 licensed**. You need an [E2B API key](https://e2b.dev/docs/getting-started/api-key) and [OpenAI API key](https://platform.openai.com/api-keys).

### How can I contribute?

Contributions welcome! Submit a Pull Request on GitHub.

### Where can I get help?

| Resource | Link |
|----------|------|
| E2B Documentation | e2b.dev/docs |
| E2B Discord | discord.gg/U7KEcGErtQ |
| GitHub Issues | github.com/e2b-dev/surf/issues |

