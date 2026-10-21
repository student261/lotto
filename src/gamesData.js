// Reference Ticket Games Data Model & Catalog for Settings Screen
// Matches LottoTrack Reference UI Specification

export const REFERENCE_SETTINGS_GAMES = [
  { id: 'sg_1', name: '5X Money', gameNumber: '1650', price: 1, ticketsPack: 300, displayTickets: 300, positionMeans: 'Next ticket to sell', lastTicket: '#299', eftCountedAs: 'Pack value $300', effective: 'Oct 1, 2026', bookValue: 300 },
  { id: 'sg_2', name: 'Jr Jumbo', gameNumber: '1602', price: 1, ticketsPack: 300, displayTickets: 300, positionMeans: 'Next ticket to sell', lastTicket: '#299', eftCountedAs: 'Pack value $300', effective: 'Oct 1, 2026', bookValue: 300 },
  { id: 'sg_3', name: 'Loteria', gameNumber: '1631', price: 2, ticketsPack: 150, displayTickets: 150, positionMeans: 'Next ticket to sell', lastTicket: '#149', eftCountedAs: 'Pack value $300', effective: 'Oct 1, 2026', bookValue: 300 },
  { id: 'sg_4', name: 'Hit 100', gameNumber: '1644', price: 2, ticketsPack: 150, displayTickets: 150, positionMeans: 'Next ticket to sell', lastTicket: '#149', eftCountedAs: 'Pack value $300', effective: 'Oct 1, 2026', bookValue: 300 },
  { id: 'sg_5', name: 'Cross Word', gameNumber: '1590', price: 3, ticketsPack: 100, displayTickets: 100, positionMeans: 'Next ticket to sell', lastTicket: '#099', eftCountedAs: 'Pack value $300', effective: 'Oct 1, 2026', bookValue: 300 },
  { id: 'sg_6', name: 'Treasure Hunt', gameNumber: '1611', price: 3, ticketsPack: 100, displayTickets: 100, positionMeans: 'Next ticket to sell', lastTicket: '#099', eftCountedAs: 'Pack value $300', effective: 'Oct 1, 2026', bookValue: 300 },
  { id: 'sg_7', name: 'Lucky 7s', gameNumber: '1688', price: 5, ticketsPack: 60, displayTickets: 60, positionMeans: 'Next ticket to sell', lastTicket: '#059', eftCountedAs: 'Pack value $300', effective: 'Oct 1, 2026', bookValue: 300 },
  { id: 'sg_8', name: '50X Money', gameNumber: '1711', price: 10, ticketsPack: 30, displayTickets: 30, positionMeans: 'Next ticket to sell', lastTicket: '#029', eftCountedAs: 'Pack value $300', effective: 'Oct 1, 2026', bookValue: 300 },
  { id: 'sg_9', name: 'Hit 1000', gameNumber: '1720', price: 20, ticketsPack: 30, displayTickets: 15, positionMeans: 'Next ticket to sell', lastTicket: '#014', eftCountedAs: 'Pack value $300', effective: 'Oct 1, 2026', bookValue: 600 },
  { id: 'sg_10', name: '500X The Money', gameNumber: '1770', price: 50, ticketsPack: 20, displayTickets: 18, positionMeans: 'Next ticket to sell', lastTicket: '#017', eftCountedAs: 'Pack value $900', effective: 'Oct 1, 2026', bookValue: 1000 },
];

export function getSettingsGamesList(state) {
  let games = JSON.parse(JSON.stringify(REFERENCE_SETTINGS_GAMES));

  // If custom games have been added to state, append them
  if (state && Array.isArray(state.customGames) && state.customGames.length > 0) {
    state.customGames.forEach((cg, idx) => {
      const price = Number(cg.price) || 1;
      const tix = Number(cg.packSize || cg.ticketsPack) || (price >= 50 ? 20 : 300 / price);
      const bVal = Number(cg.bookValue) || (price * tix);
      games.push({
        id: cg.id || `custom_game_${idx}`,
        name: cg.name || 'Custom Game',
        gameNumber: String(cg.gameNumber || cg.barcodePrefix || '9999'),
        price: price,
        ticketsPack: tix,
        bookValue: bVal
      });
    });
  }

  return games;
}

export const REFERENCE_MODERN_SETTINGS_GAMES = [
  { gameId: '1401', name: '5X Money', price: '$1', packValue: '$300', ticketsPack: '300', positionsCount: 'Up' },
  { gameId: '1403', name: 'Loteria', price: '$2', packValue: '$300', ticketsPack: '150', positionsCount: 'Up' },
  { gameId: '1406', name: 'Cross Word', price: '$3', packValue: '$300', ticketsPack: '100', positionsCount: 'Up' },
  { gameId: '1409', name: 'Gold $500,000', price: '$5', packValue: '$300', ticketsPack: '60', positionsCount: 'Up' },
  { gameId: '1408', name: '50X Money', price: '$10', packValue: '$300', ticketsPack: '30', positionsCount: 'Up' },
  { gameId: '1415', name: 'Hit 1000', price: '$20', packValue: '$300', ticketsPack: '15', positionsCount: 'Up' },
  { gameId: '1413', name: 'Jumbo Bucks Ext', price: '$50', packValue: '$900', ticketsPack: '18', positionsCount: 'Up' },
  { gameId: '1414', name: 'Cash 500,000', price: '$50', packValue: '$900', ticketsPack: '18', positionsCount: 'Up' },
  { gameId: '1770', name: '500X The Money', price: '$50', packValue: '$900', ticketsPack: '18', positionsCount: 'Up' },
  { gameId: '1611', name: 'Treasure Hunt', price: '$3', packValue: '$300', ticketsPack: '100', positionsCount: 'Up' },
];
