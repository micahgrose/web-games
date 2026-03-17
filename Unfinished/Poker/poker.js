class Card{
	constructor(rank, suit){
		this.rank = rank;
		this.suit = suit;
	}
}


let deck = [];

let suitVec = {
	0:'spade',
	1:'club',
	2:'heart',
	3:'diamond'
}

let invalidDeck = false;
while(deck.length < 52){
	invalidDeck = false;
	let rank = Math.floor(Math.random()*12)+2;
	let suit = Math.floor(Math.random()*4);
	let card = new Card(rank, suit);

	for(let c of deck){
		if(card.rank == c.rank && card.suit == c.suit){
			invalidDeck = true;
		}
	}

	if(invalidDeck) continue;
	console.log(true);
	deck.push(card);
}