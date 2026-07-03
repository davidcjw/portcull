# portcull demo — render with:  vhs docs/demo.tape   (https://github.com/charmbracelet/vhs)
# Produces docs/demo.gif, embedded in the README.
Output docs/demo.gif

Set FontSize 16
Set Width 1160
Set Height 720
Set Padding 24
Set Theme "Dracula"
Set TypingSpeed 45ms

Type "portcull ls"
Sleep 500ms
Enter
Sleep 2.8s

Type "portcull kill 3738 --dry-run"
Sleep 500ms
Enter
Sleep 3s
