const [isModalVisible, setIsModalVisible] = useState(false);
const [games, setGames] = useState([]);
const [selectedGameId, setSelectedGameId] = useState(null);

const fetchGames = async () => {
    // Make an API call to fetch the list of games
    // Update the `games` state with the fetched data
};

const handleGameSelect = (gameId) => {
    setSelectedGameId(gameId);
    // Close the modal
    setIsModalVisible(false);
    // Make an API call to fetch the selected game details
    // Navigate to the SplitScreenChat component with the fetched game data
};