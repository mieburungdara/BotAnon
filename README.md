# BotAnon - Anonymous Telegram Chat Bot

A Telegram bot that allows users to chat anonymously with random strangers. Users are matched one-on-one and can end chats to find new partners.

## Features

- Anonymous one-on-one chatting
- Profile setup (age, gender, language) required for all users
- Settings menu to update profile information
- Commands:
  - `/start` - Begin using the bot (forces profile completion for new users)
  - `/find` - Search for a new chat partner
  - `/next` - End current chat and find a new partner
  - `/stop` - Stop searching for partners (return to idle state)
  - `/settings` - Update your profile (age, gender, language)
- Message history stored in PostgreSQL database
- Real-time message forwarding

## Setup

1. Create a Telegram bot using [BotFather](https://t.me/BotFather) and obtain your bot token
2. Set up a PostgreSQL database
3. Copy `.env.example` to `.env` and fill in your credentials:
   ```
   BOT_TOKEN=your_telegram_bot_token_here
   DATABASE_URL=postgresql://username:password@localhost:5432/botanondb
   ```
4. Install dependencies: `npm install`
5. Run the bot: `npm start`

## Database Schema

The bot automatically creates the following tables on startup:

- `users`: Stores user information including Telegram ID, username, age, gender, language, and current state
- `chats`: Tracks active chat sessions between pairs of users
- `messages`: Stores all messages sent during chats for history/audit purposes

## User States

- `idle`: Not searching for a chat partner
- `waiting`: Searching for a chat partner
- `chatting`: Currently in an active chat
- `profileSetup`: In the process of completing profile (age, gender, language)

## Commands Explained

- `/start`: Registers new users or returns existing users to the waiting state. New users must complete their profile before chatting.
- `/find`: Searches for a new chat partner. If currently in a chat, ends that chat first.
- `/next`: Ends the current chat (if any) and immediately searches for a new partner. Notifies the previous partner.
- `/stop`: Stops searching for partners and returns to idle state. Only works when not in an active chat.
- `/settings`: Opens a conversation to update age, gender, or language preferences.

## How Matching Works

When a user sets their state to `waiting`, the bot looks for another user in the `waiting` state. If found, both users are moved to `chatting` state and a chat session is created. Messages are forwarded between partners in real-time and stored in the database.

## Profile Completion

New users are required to complete their profile (age, gender, language) before they can start chatting. This happens automatically when they first use `/start`. Existing users can update their profile anytime using `/settings`.

## License

ISC