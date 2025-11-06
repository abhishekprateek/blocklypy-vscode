/**
 * Sanitize HTML to prevent XSS attacks.
 */
export function sanitizeHtml(text: string): string {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(text));
    return div.innerHTML;
}
