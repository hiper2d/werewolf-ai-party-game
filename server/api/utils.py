import random
from collections import Counter
from typing import List


def get_top_items_within_range(counter: Counter, min_count: int, max_count: int) -> List[str]:
    """
    Get top items from a Counter object, ensuring at least min_count items are returned.
    If there are ties, randomly select among the tied items to return up to max_count items.
    
    :param counter: Counter object containing item counts.
    :param min_count: Minimum number of top items to return.
    :param max_count: Maximum number of top items to return.
    :return: List of tuples (item, count) for the top items, considering the specified range and ties.
    """
    # Ensure min_count is not greater than max_count
    min_count = min(min_count, max_count)

    # Get all items sorted by count in descending order
    sorted_items = counter.most_common()

    # Determine the cutoff count for min_count items (initially considering no ties)
    if len(sorted_items) > min_count:
        cutoff_count = sorted_items[min_count - 1][1]
    else:
        # If there are not enough items to reach min_count, return all items
        return sorted_items

    # Find the actual cutoff to include ties within the range of min_count to max_count
    last_item_index_within_max = min_count - 1
    for item, count in sorted_items[min_count:]:
        if count == cutoff_count and last_item_index_within_max < max_count - 1:
            last_item_index_within_max += 1
        else:
            break

    # If the last index within max is exactly at the boundary, no need for random selection
    if last_item_index_within_max < max_count - 1 or sorted_items[last_item_index_within_max][1] != cutoff_count:
        return [item for item, count in sorted_items[:last_item_index_within_max + 1]]

    # If there's a tie affecting the last spot(s), randomly select among the tied items
    tied_items_with_cutoff_count = [item for item in sorted_items if item[1] == cutoff_count]
    additional_items_needed = max_count - (last_item_index_within_max + 1 - len(tied_items_with_cutoff_count))

    # Randomly select the additional items needed from the tied items
    selected_from_ties = random.sample(tied_items_with_cutoff_count, additional_items_needed)

    # Return the keys of the combination of guaranteed items and randomly selected tied items
    guaranteed_keys = [item for item, count in sorted_items[:last_item_index_within_max + 1 - len(tied_items_with_cutoff_count)]]
    selected_keys_from_ties = [item for item, count in selected_from_ties]

    return guaranteed_keys + selected_keys_from_ties
