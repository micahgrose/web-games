// const GROQ_API_KEY = 'REDACTED_API_KEY';
const GROQ_API_KEY = 'REPLACE_WITH_GROQ_API_KEY';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

const suits = ['Hearts', 'Diamonds', 'Clubs', 'Spades'];
const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
let deck = createDeck();
let lastDrawnCard = null;
let lastDrawnCardValue = null;

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
        content: "The user will tell you what they want to be and do in this role play game. After they submit a prompt to you, you decide how much their idea succeeds or fails based on a value they give you as well. 2 is the lowest value and means the prompt fails the most. 14 is the highest value and means the prompt succeeds the most. You will use context and the user's character's current situation to decide what exactly happens. The more complex the prompt, the larger value needed to succeed. Keep your responses concise and focused on the outcome of the user's prompt. Always exclude unimportant details."
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

    submitBtn.addEventListener('click', async function() {
        const userMessage = messageInput.value.trim();
        
        if (!userMessage) {
            alert('Please enter a message');
            return;
        }

        addChatMessage('User', userMessage);
        drawTopCard();
        updateDeckDisplay();

        const formattedPrompt = `${userMessage}. Value: ${lastDrawnCardValue}.`;
        responseContainer.innerHTML = '<p><em>Loading...</em></p>';
        submitBtn.disabled = true;

        try {
            const response = await callGroqAPI(formattedPrompt);
            addChatMessage('Assistant', response);
            responseContainer.innerHTML = '';
            messageInput.value = '';
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

    shuffleDeck();
    shuffleDeck();
    shuffleDeck();
    updateDeckDisplay();
});