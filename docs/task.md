I want you to refactor the Anthropic agent. I realized that I don't need the `ask` method, since I will alway expect responses in JSON format following a provided schema. Let's not remove it entirelly but keep empty to not to break the inherritance.

Work on the following tasks in order:
[x] - Clear ask method
[x] - Move prompts to variables out of the method to improve readability
[x] - Let's try to avoid throwing exceptions with are cought in the same method
[x] - Let's avoid returning null. It should be either string cleanned response or an exception

Mark the completed test with [x] and uncompleted tasks as [ ]