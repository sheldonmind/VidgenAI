# HuggingFace AI Clone - React + Vite

A modern, beautiful AI chat interface inspired by Hugging Face's design, built with React, Vite, and Tailwind CSS.

## Features

- 🎨 Modern, clean UI inspired by Hugging Face
- 💬 Real-time chat interface with message history
- 🎭 User and AI message distinction
- 📱 Responsive design for all devices
- 🎯 Collapsible sidebar for conversations
- ⚡ Fast development with Vite
- 🎨 Styled with Tailwind CSS
- 🎭 Beautiful animations and transitions

## Tech Stack

- **React 18** - UI library
- **Vite** - Build tool and dev server
- **Tailwind CSS** - Utility-first CSS framework
- **Lucide React** - Beautiful icon library

## Getting Started

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Visit `http://localhost:5173` to see your app.

### Build for Production

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

## Project Structure

```
src/
├── components/
│   ├── Header.jsx       # Top navigation bar
│   ├── Sidebar.jsx      # Left sidebar with conversations
│   ├── ChatArea.jsx     # Main chat interface
│   ├── MessageList.jsx  # Display chat messages
│   └── ChatInput.jsx    # Message input component
├── App.jsx              # Main app component
├── main.jsx             # Entry point
└── index.css            # Global styles with Tailwind

```

## Customization

### Colors

Edit `tailwind.config.js` to customize the color scheme:

```js
theme: {
  extend: {
    colors: {
      primary: '#FF9D00',    // Change primary color
      secondary: '#3B82F6',  // Change secondary color
    },
  },
}
```

### Adding AI Integration

To connect with a real AI API (like Hugging Face Inference API):

1. Install axios: `npm install axios`
2. Update the `handleSendMessage` function in `ChatArea.jsx`
3. Add your API key and endpoint

Example:

```jsx
const handleSendMessage = async (content) => {
  // Add user message
  const userMessage = { /* ... */ }
  setMessages([...messages, userMessage])

  // Call AI API
  const response = await fetch('YOUR_API_ENDPOINT', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer YOUR_TOKEN',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ inputs: content }),
  })

  const data = await response.json()
  // Add AI response to messages
}
```

## Contributing

Feel free to submit issues and enhancement requests!

## License

MIT License - feel free to use this project for learning and development.
