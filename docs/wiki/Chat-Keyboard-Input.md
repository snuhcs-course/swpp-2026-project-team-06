# Send chat with Enter and preserve IME and multiline input

DEV-351 | Local implementation prepared for human review

One-to-one chat enables Enter-to-send and Shift+Enter newlines, retains the send button and refuses empty or duplicate submissions. Web composition listeners and the keyCode 229 guard prevent Korean IME confirmation from submitting, including a following native beforeinput line-break event. Mobile line-break requests without keydown submit once. Broadcast composition keeps its existing newline behavior. Retry and idempotent sending continue through ChatThread.

The source of truth is the related Korean feature specification and the issue-specific task file. Production deployment is a separate post-merge step.
