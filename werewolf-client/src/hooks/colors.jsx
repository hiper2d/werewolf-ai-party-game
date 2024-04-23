export const uniqueColors = [
    '#ff0000', // Red
    '#00ff00', // Green
    '#0000ff', // Blue
    '#ffff00', // Yellow
    '#ff00ff', // Magenta
    '#00ffff', // Cyan
    '#800000', // Maroon
    '#808000', // Olive
    '#008000', // Green (dark)
    '#008080', // Teal
    '#000080', // Navy
    '#800080', // Purple
    '#ffa500', // Orange
    '#ffc0cb', // Pink
    '#800080', // Purple (dark)
    // Add more unique colors as needed
];

export const getRandomColor = () => {
    const randomIndex = Math.floor(Math.random() * participantColors.length);
    return participantColors[randomIndex];
};

export const getUniqueColor = (usedColors) => {
    const availableColors = uniqueColors.filter(color => !usedColors.includes(color));
    if (availableColors.length === 0) {
        throw new Error('No more unique colors available');
    }
    const randomIndex = Math.floor(Math.random() * availableColors.length);
    return availableColors[randomIndex];
};