import { useWindowSize } from "ink";

// Leaves room for the app header, the screen title and the key hints.
export const useListLimit = () => Math.max(5, useWindowSize().rows - 10);
