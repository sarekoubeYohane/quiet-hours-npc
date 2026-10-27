/* Existing meal/tool scenarios scope object expectations to their subject area.
 * Phones have an independent activation baseline and their own API assertions. */
exports.nonPhoneObjects=world=>(world.objects||[]).filter(object=>object.kind!=='phone');
