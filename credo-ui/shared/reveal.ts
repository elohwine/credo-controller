import styles from './Reveal.module.css'

/** Class names for entrance motion shared by the phone app and the portal. See Reveal.module.css. */
export const reveal = {
  /** Children appear one after another. Change the container's `key` to replay. */
  stagger: styles.stagger,
  /** The element itself rises in. */
  rise: styles.rise,
  /** Rows of a section that was just opened. */
  unfold: styles.unfold,
}
