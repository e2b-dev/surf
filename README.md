![Invoke logo](/public/invoke-logo.png)

# Invoke - Paychex Flex to ADP Computer Use Agent

A Next.js application that launches an Invoke Paychex Flex to ADP migration discovery flow in a virtual desktop environment. This project integrates a desktop sandbox with OpenAI's API to create an AI agent that can inspect Paychex report access through a virtual computer.

Invoke uses an isolated virtual computer in the cloud for Paychex report-access discovery.
Each signed-in user gets their own sandbox records. The server checks sandbox ownership before connecting to, extending, or stopping a sandbox, so one user cannot use another user's sandbox ID.

## Overview

The Computer Use App provides a web interface where users can:

1. Automatically start a virtual desktop sandbox environment
2. Install and launch Chrome in the Linux desktop
3. Open Paychex Flex at `https://partners.paychex.com/companies`
4. Guide the user through Paychex login and report-access discovery
5. Watch as the AI agent navigates toward Analytics and Reports > All Reports

The application uses Server-Sent Events (SSE) to stream AI responses and actions in real-time, providing a seamless experience.

## How It Works

### Architecture

The application consists of several key components:

1. **Frontend UI (Next.js)**: Provides the user interface with a virtual desktop view and chat interface
2. **Desktop Sandbox**: Creates and manages virtual desktop environments
3. [**OpenAI Computer Use**](https://platform.openai.com/docs/guides/tools-computer-use): Processes user instructions and generates actions for the AI agent
4. **Streaming API**: Handles real-time communication between the frontend and backend

### Core Flow

1. The app auto-starts the Paychex Flex to ADP migration discovery flow
2. The sandbox creates a virtual desktop and provides a URL for streaming
3. The backend installs Chrome if needed and opens the Paychex portal
4. Backend processes the fixed Paychex flow instructions using OpenAI's API
5. AI guides login/MFA, verifies the selected company in the top right, and navigates left menu > Analytics and Reports > All Reports
6. AI reports whether the selected company has Paychex reports access

## Prerequisites

Before starting, you'll need:

1. [Node.js](https://nodejs.org/) (version specified in package.json)
2. [npm](https://www.npmjs.com/) (comes with Node.js)
3. PostgreSQL, or Docker Compose for the included Postgres service
4. An [E2B API key](https://e2b.dev/docs/getting-started/api-key)
5. An [OpenAI API key](https://platform.openai.com/api-keys)

## Setup Instructions

1. **Clone the repository**
```bash
git clone https://github.com/Invoke-Pub-Sec-AI/surf
cd surf
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up environment variables**

Create a `.env` file in the root directory based on the provided `.env.example`:

```env
E2B_API_KEY=your_e2b_api_key
OPENAI_API_KEY=your_openai_api_key
DATABASE_URL=postgresql://surf:surf@localhost:5432/surf
```

4. **Start Postgres**

For local development, run a Postgres database that matches `DATABASE_URL`. The included Docker Compose file starts Postgres and the app together:

```bash
docker compose up --build
```

5. **Start the development server**
```bash
npm run dev
```

6. **Open the application**

Navigate to [http://localhost:3000](http://localhost:3000) in your browser.

The database schema is created automatically on first request. A default user is seeded:

```text
email: admin
password: admin
```

## Usage

1. **Open the Application**
   - The Paychex Flex to ADP discovery flow starts automatically
   - Wait for the sandbox to start and Chrome to open Paychex Flex

2. **Complete Paychex Login**
   - Use the virtual desktop to complete login and MFA when prompted
   - Confirm the correct company is selected in the top right before reports are checked

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
- **Paychex Flex to ADP Flow**: Auto-launches the report-access discovery workflow
- **Chrome Bootstrap**: Installs and opens Chrome in the Linux sandbox
- **AI-Powered Interaction**: Uses OpenAI's API to execute the fixed migration discovery flow
- **Real-Time Streaming**: Shows AI actions and responses as they happen
- **Chat Interface**: Provides a conversational interface for interacting with the AI
- **User Login**: Stores users, sessions, and sandbox ownership in Postgres
- **Dark/Light Mode**: Supports both dark and light themes

## Technical Details

### Dependencies

The application uses several key dependencies:

- **Next.js**: React framework for the frontend
- **@e2b/desktop**: SDK for creating and managing desktop sandbox environments
- **OpenAI**: SDK for interacting with OpenAI's API
- **Tailwind CSS**: Utility-first CSS framework for styling
- **Framer Motion**: Library for animations
- **PostgreSQL**: Stores users, sessions, and sandbox ownership records

See `package.json` for a complete list of dependencies.

### API Endpoints

- **/api/chat**: Handles chat messages and streams AI responses and actions
- **/login**: Signs users in with email and password
- **/signup**: Creates users with email and password

### Server Actions

- **increaseTimeout**: Extends the sandbox timeout
- **stopSandboxAction**: Stops a running sandbox instance
- **logoutAction**: Clears the active login session

## Troubleshooting

- **Sandbox not starting**: Verify your E2B API key is correct in `.env`
- **AI not responding**: Check that your OpenAI API key is valid and has access to the required models
- **Login fails or pages return server errors**: Verify Postgres is running and `DATABASE_URL` points to it
- **Actions not working**: Ensure the sandbox is running and the AI has proper instructions

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

## Support

If you encounter any issues or have questions:
- Open an [issue](https://github.com/Invoke-Pub-Sec-AI/surf/issues)
