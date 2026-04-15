// const GROQ_API_KEY = 'REDACTED_API_KEY';
const GROQ_API_KEY = 'REDACTED_API_KEY';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

const suits = ['Hearts', 'Diamonds', 'Clubs', 'Spades'];
const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
let deck = createDeck();
let lastDrawnCard = null;
let lastDrawnCardValue = null;

let players = [];
let currentPlayerIndex = 0;
const playerColors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'];

function createDeck() {
    return suits.flatMap(suit => ranks.map(rank => ({ rank, suit })));
}

function shuffleDeck() {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
}

function formatCard(card) {
    return card ? `${card.rank} of ${card.suit}` : 'None';
}

function getSuitSymbol(suit) {
    switch (suit) {
        case 'Hearts': return '♥';
        case 'Diamonds': return '♦';
        case 'Clubs': return '♣';
        case 'Spades': return '♠';
        default: return '';
    }
}

function getSuitColor(suit) {
    return suit === 'Hearts' || suit === 'Diamonds' ? 'red' : 'black';
}

function getRankCount(rank) {
    switch (rank) {
        case 'A': return 14;
        case 'J': return 11;
        case 'Q': return 12;
        case 'K': return 13;
        default: return Number(rank) || 0;
    }
}

function getCardValue(card) {
    if (!card) return 0;
    switch (card.rank) {
        case 'A': return 14;
        case 'J': return 11;
        case 'Q': return 12;
        case 'K': return 13;
        default: return Number(card.rank) || 0;
    }
}

function getPipPositions(rank) {
    switch (rank) {
        case 'A': return [[3,2]];
        case '2': return [[1,2],[5,2]];
        case '3': return [[1,2],[3,2],[5,2]];
        case '4': return [[1,1],[1,3],[5,1],[5,3]];
        case '5': return [[1,1],[1,3],[3,2],[5,1],[5,3]];
        case '6': return [[1,1],[1,3],[3,1],[3,3],[5,1],[5,3]];
        case '7': return [[1,1],[1,3],[2,2],[3,1],[3,3],[5,1],[5,3]];
        case '8': return [[1,1],[1,3],[2,2],[3,1],[3,3],[4,2],[5,1],[5,3]];
        case '9': return [[1,1],[1,3],[2,2],[3,1],[3,2],[3,3],[4,2],[5,1],[5,3]];
        case '10': return [[1,1],[1,3],[2,2],[3,1],[3,3],[4,2],[5,1],[5,3],[2,1],[4,3]];
        case 'J': return [[1,1],[1,3],[2,1],[2,3],[3,1],[3,3],[4,1],[4,3],[5,1],[5,3],[3,2]];
        case 'Q': return [[1,1],[1,3],[2,1],[2,3],[3,1],[3,3],[4,1],[4,3],[5,1],[5,3],[2,2],[4,2]];
        case 'K': return [[1,1],[1,3],[2,1],[2,3],[3,1],[3,3],[4,1],[4,3],[5,1],[5,3],[2,2],[3,2],[4,2]];
        default: return [];
    }
}

function renderCardFace(card) {
    if (!card) {
        return `
            <div class="card-face-center">
                <div class="card-pip">?</div>
            </div>
        `;
    }

    const symbol = getSuitSymbol(card.suit);
    const colorClass = getSuitColor(card.suit);

    if (['J', 'Q', 'K'].includes(card.rank)) {
        const faceName = card.rank === 'J' ? 'Jack' : card.rank === 'Q' ? 'Queen' : 'King';
        return `
            <div class="card-face-corner top-left ${colorClass}">${card.rank}<br>${symbol}</div>
            <div class="card-face-corner bottom-right ${colorClass}">${card.rank}<br>${symbol}</div>
            <div class="card-face-center face-card ${colorClass}">
                <div class="face-card-title">${faceName}</div>
                <div class="face-card-portrait">${symbol}</div>
                <div class="face-card-subtitle">${card.suit}</div>
            </div>
        `;
    }

    const positions = getPipPositions(card.rank);
    const pips = positions.map(([row, col]) => `
        <div class="card-pip ${colorClass}" style="grid-row: ${row}; grid-column: ${col};">${symbol}</div>
    `).join('');

    return `
        <div class="card-face-corner top-left ${colorClass}">${card.rank}<br>${symbol}</div>
        <div class="card-face-corner bottom-right ${colorClass}">${card.rank}<br>${symbol}</div>
        <div class="card-face-center">
            ${pips}
        </div>
    `;
}

function drawTopCard() {
    if (lastDrawnCard) {
        deck.push(lastDrawnCard);
    }

    lastDrawnCard = deck.shift();
    lastDrawnCardValue = getCardValue(lastDrawnCard);
    return lastDrawnCard;
}

const conversationHistory = [
    {
        role: 'system',
        content: "This is a multiplayer role-playing game. Players take turns submitting actions for their characters. You must remember each player's character and only carry out actions for the current player's character on their turn. The current player is specified in each prompt. Decide success or failure based on the card value: 2 is lowest (most failure), 14 is highest (most success). Be creative and advance the story accordingly. Keep responses concise and focused on outcomes."
    }
];

/**
 * Call the Groq API with a message
 * @param {string} userMessage - The message to send to the API
 * @param {string} model - The model to use (default: llama-3.3-70b-versatile)
 * @returns {Promise<string>} - The API response text
 */
async function callGroqAPI(userMessage, model = 'llama-3.3-70b-versatile') {
    try {
        conversationHistory.push({ role: 'user', content: userMessage });

        const response = await fetch(GROQ_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: model,
                messages: conversationHistory,
                max_tokens: 1024,
            }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('Full error response:', errorData);
            throw new Error(`Groq API error: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`);
        }

        const data = await response.json();
        const assistantMessage = data.choices[0].message.content;
        conversationHistory.push({ role: 'assistant', content: assistantMessage });
        return assistantMessage;
    } catch (error) {
        console.error('Error calling Groq API:', error);
        throw error;
    }
}

// Initialize UI when page loads
document.addEventListener('DOMContentLoaded', function() {
    const menuPanel = document.getElementById('menuPanel');
    const gamePanel = document.getElementById('gamePanel');
    const startSetupBtn = document.getElementById('startSetupBtn');
    const startGameBtn = document.getElementById('startGameBtn');
    const numPlayersInput = document.getElementById('numPlayers');
    const playerInputsDiv = document.getElementById('playerInputs');
    const turnIndicator = document.getElementById('turnIndicator');
    const submitBtn = document.getElementById('submitBtn');
    const messageInput = document.getElementById('messageInput');
    const chatHistory = document.getElementById('chatHistory');
    const responseContainer = document.getElementById('responseContainer');
    const deckVisual = document.getElementById('deckVisual');
    const drawnCardVisual = document.getElementById('drawnCardVisual');

    function updateDeckDisplay() {
        deckVisual.innerText = deck.length > 0 ? 'Deck' : 'Empty';
        drawnCardVisual.className = `card-front ${lastDrawnCard ? getSuitColor(lastDrawnCard.suit) : ''}`;
        drawnCardVisual.innerHTML = renderCardFace(lastDrawnCard);
    }

    function addChatMessage(role, text) {
        const messageElement = document.createElement('div');
        messageElement.className = `chat-message ${role.toLowerCase()}`;
        messageElement.innerHTML = `<strong>${role}:</strong> <span>${text}</span>`;
        chatHistory.appendChild(messageElement);
        chatHistory.scrollTop = chatHistory.scrollHeight;
    }

    function nextTurn() {
        currentPlayerIndex = (currentPlayerIndex + 1) % players.length;
        updateTurnDisplay();
    }

    function updateTurnDisplay() {
        const currentPlayer = players[currentPlayerIndex];
        turnIndicator.textContent = `${currentPlayer.name}'s Turn`;
        document.body.style.backgroundColor = currentPlayer.color;
    }

    startSetupBtn.addEventListener('click', function() {
        const numPlayers = parseInt(numPlayersInput.value);
        if (numPlayers < 2 || numPlayers > 10) {
            alert('Please enter a number between 2 and 10.');
            return;
        }
        playerInputsDiv.innerHTML = '';
        for (let i = 0; i < numPlayers; i++) {
            const playerDiv = document.createElement('div');
            playerDiv.className = 'player-input';
            playerDiv.innerHTML = `
                <label>Player ${i + 1} Name:</label>
                <input type="text" placeholder="Enter name" data-index="${i}" />
                <div class="player-color" style="background-color: ${playerColors[i]};"></div>
            `;
            playerInputsDiv.appendChild(playerDiv);
        }
        document.getElementById('playerSetup').style.display = 'block';
    });

    startGameBtn.addEventListener('click', function() {
        const inputs = playerInputsDiv.querySelectorAll('input');
        players = [];
        for (let i = 0; i < inputs.length; i++) {
            const name = inputs[i].value.trim();
            if (!name) {
                alert('Please enter names for all players.');
                return;
            }
            players.push({ name, color: playerColors[i] });
        }
        menuPanel.style.display = 'none';
        gamePanel.style.display = 'block';
        shuffleDeck();
        shuffleDeck();
        shuffleDeck();
        updateTurnDisplay();
        updateDeckDisplay();
    });

    submitBtn.addEventListener('click', async function() {
        const userMessage = messageInput.value.trim();
        
        if (!userMessage) {
            alert('Please enter an action');
            return;
        }

        const currentPlayer = players[currentPlayerIndex];
        addChatMessage(currentPlayer.name, userMessage);
        drawTopCard();
        updateDeckDisplay();

        const formattedPrompt = `${currentPlayer.name}: ${userMessage}. Value: ${lastDrawnCardValue}.`;
        responseContainer.innerHTML = '<p><em>Loading...</em></p>';
        submitBtn.disabled = true;

        try {
            const response = await callGroqAPI(formattedPrompt);
            addChatMessage('Assistant', response);
            responseContainer.innerHTML = '';
            messageInput.value = '';
            nextTurn();
        } catch (error) {
            responseContainer.innerHTML = `<div class="error"><strong>Error:</strong> ${error.message}</div>`;
        } finally {
            submitBtn.disabled = false;
        }
    });


    // Allow submitting by pressing Enter
    messageInput.addEventListener('keypress', function(event) {
        if (event.key === 'Enter') {
            submitBtn.click();
        }
    });

    // Allow submitting by pressing Enter
    messageInput.addEventListener('keypress', function(event) {
        if (event.key === 'Enter') {
            submitBtn.click();
        }
    });
});
