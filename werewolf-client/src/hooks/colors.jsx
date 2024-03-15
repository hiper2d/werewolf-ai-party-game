export const participantColors = [
    '#61dafb', // React blue
    '#a0f0ed', // Light blue
    '#50e3c2', // Turquoise
    '#f8c555', // Yellow
    '#f76b1c', // Orange
    '#e44d26', // Red
    '#cd84f1', // Pink
    '#c56cf0', // Purple
    '#ffcc00', // Gold
    '#67e480', // Green
];

export const getRandomColor = () => {
    const randomIndex = Math.floor(Math.random() * participantColors.length);
    return participantColors[randomIndex];
};