# Werewolf Party Game with AI Bots

<img src="images/werewolf-ai-logo-1.webp" width="600">

Reserved repository for the Backdrop Build V3 hackathon on February 26, 2024. More details about the event.

All projects registry: [Builds](https://backdropbuild.com/builds)

The event project page: [ai-werewolf](https://backdropbuild.com/v3/ai-werewolf)

# Gameplay

What is nice about this game is complete freedom in the themes and roleplay. You can create any setting you want. A movie, a book, any historical period, or even a completely new world. The game is very flexible and can be adapted to any setting. 

Here is an example of the "Terminator" theme:
<img src="images/screen2.png">

Or "Lord of the Rings":
<img src="images/screen3.png">

I really like these thematic dialogs and how creative the bots are. 

UI is chunky and ugly yet but I'm working on it. It's a very early stage of the project.

It is only possible to create a new game, to chat with bot players and to initiate a first round of voting. I have more things in the API but UI is not ready yet.

# Setup

### Run Redis

I prefer to run it with Docker Compose. There is a config in the root directory, just run it. You need to have docker
and docker-compose installed.

```bash
docker-compose up
```

### Run Python functions

Before running Python code, rename the [.env.template](.env.template) file into `.env` and fill in the values. All
environmental variables from it will be loaded by functions and used to talk to the external APIs (Redis, OpenAI).

I don't have any better runner than Python junit tests for now. In future, I'll use a web server with UI in React Native
for the local development. I'll deploy functions to Lambdas and host UI somewhere separately.
Each function has a separate test. It does not make sense to run all of them, only for the function you want to run.
To run tests, install Python dependencies using `Pipenv` (more details about it is [below](#pipenv_setup)), then run a
test you need like this:

   ```bash
   python -m unittest test_lambda_functions.TestGameFunctions.test_init_game
   ```

### <a id="pipenv_setup"></a>Pipenv setup and dependency installation

I use `pipenv` to manage dependencies. Install it, create a virtual environment, activate it and install dependencies.

1. Install `pipenv` using official [docs](https://pipenv.pypa.io/en/latest/install/#installing-pipenv). For example, on
   Mac:
    ```bash
    pip install pipenv --user
    ```

2. Add `pipenv` to PATH if it's not there. For example, I had to add to the `~/.zshrc` file the following line:
    ```bash
    export PATH="/Users/hiper2d/Library/Python/3.11/bin:$PATH"
    ```

3. Install packages and create a virtual environment for the project:
    ```bash
    cd <project dir> # navigate to the project dir
    pipenv install
    ```
   This should create a virtual environment and install all dependencies from `Pipfile.lock` file.

   If for any reason you need to create a virtual environment manually, use the following command:
    ```bash
    pip install virtualenv # install virtualenv if you don't have it
    virtualenv --version # check if it's installed
    cd <virtualenv dir> # for example, my virtual envs as here: /Users/hiper2d/.local/share/virtualenvs
    virtualenv <virtualenv name> # I usually use a project name
    ```

4. To swtich to the virtual environment, use the following command:
    ```bash
    cd <project dir>
    pipenv shell
    ```
   If this fails, then do the following:
    ```bash
    cd <virtualenv dir>/bin
    source activate
    ```