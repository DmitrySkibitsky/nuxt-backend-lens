# Sourced by the demo scripts. load_env FILE exports its KEY=VALUE lines without running the file as
# shell code (a value with spaces or `$(…)` stays a plain string). Variables already set in the
# environment win, as in docker compose.

load_env() {
    [ -f "$1" ] || return 0
    while IFS= read -r line || [ -n "$line" ]; do
        case $line in
            '' | '#'*) continue ;;
        esac
        key=${line%%=*}
        value=${line#*=}
        case $key in
            '' | [0-9]* | *[!A-Za-z0-9_]*) continue ;;
        esac
        case $value in
            \"*\")
                value=${value#\"}
                value=${value%\"}
                ;;
            \'*\')
                value=${value#\'}
                value=${value%\'}
                ;;
        esac
        # $key is a validated identifier, so the eval only reads whether it is set.
        is_set=
        eval "is_set=\${$key+set}"
        [ "$is_set" = set ] || export "$key=$value"
    done < "$1"
}
