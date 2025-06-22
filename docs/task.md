Let's implement the werewolves night phase. I expect the following logic:
- check if the gameStateParamQueue field is empty
- if 
- in the beginning, we need check if we have more than 1 alive werewolf
- in case, it's only one, then we only put its name into the gameStateParamQueue as a single item array
- if there are more than 1 alive werewolves, then create a random array with each werewolf name present in it twice. To do so, create a random list  with werewolves name and append it to itself. Store the result array in the gameStateParamQueue field

[
    werewolf1, 
    werewolf2, 
    werewolf3,
    werewolf1, 
    werewolf2, 
    werewolf3, 
]