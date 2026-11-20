import { defaultPackage } from '../../scenes/packages/scenePackage.js';
import { createShelfArrangement } from './shelfArrangement.js';
export { orientations, carriedBooks } from './shelfArrangement.js';

export const {
  arrangementKey, shelves: displayShelves, shelfRegions, loadArrangement,
  arrangeBooks, dropBook, dropStack, dropGroup, filterShelfLayout
} = createShelfArrangement(defaultPackage.displayShelves ?? [], { storage: defaultPackage.displayShelfStorage });
