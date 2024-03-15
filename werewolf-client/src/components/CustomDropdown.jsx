import React, { useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';

const CustomDropdown = ({ options, onSelect, placeholder }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [selectedOption, setSelectedOption] = useState(null);

    const toggleDropdown = () => {
        setIsOpen(!isOpen);
    };

    const handleSelect = (option) => {
        setSelectedOption(option);
        onSelect(option);
        setIsOpen(false);
    };

    return (
        <View style={styles.container}>
            <TouchableOpacity style={styles.dropdownButton} onPress={toggleDropdown}>
                <Text style={styles.dropdownButtonText}>
                    {selectedOption ? selectedOption.label : placeholder}
                </Text>
                <Icon name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color="#61dafb" />
            </TouchableOpacity>
            {isOpen && (
                <FlatList
                    data={options}
                    keyExtractor={(item) => item.value}
                    renderItem={({ item }) => (
                        <TouchableOpacity style={styles.option} onPress={() => handleSelect(item)}>
                            <Text style={styles.optionText}>{item.label}</Text>
                        </TouchableOpacity>
                    )}
                    style={styles.optionsList}
                />
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        width: '100%',
        marginBottom: 10,
    },
    dropdownButton: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 12,
        borderWidth: 1,
        borderColor: '#61dafb',
        borderRadius: 5,
    },
    dropdownButtonText: {
        color: '#fff',
        fontSize: 16,
    },
    optionsList: {
        backgroundColor: '#282c34',
        borderWidth: 1,
        borderColor: '#61dafb',
        borderRadius: 5,
        maxHeight: 150,
    },
    option: {
        paddingHorizontal: 10,
        paddingVertical: 12,
    },
    optionText: {
        color: '#fff',
        fontSize: 16,
    },
});

export default CustomDropdown;