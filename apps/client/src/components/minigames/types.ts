/** The contract every minigame renderer follows (TASKS §3). */

export interface MinigameProps<P, A, Act = never, F = never> {
  puzzle: P;
  /** Hand the final answer to the server. */
  onSubmit: (answer: A) => void;
  /** One step of a multi-step game; resolves with the server's feedback, or `undefined` when the step failed. */
  onAction: (action: Act) => Promise<F | undefined>;
  /** True while a request is in flight or the wrong-answer lockout runs. */
  disabled: boolean;
}
