/**
 * Base serializer.
 * Subclasses implement `serialize(record)` to shape a single record.
 * `collection()` maps an array through `serialize()`.
 */
export abstract class BaseSerializer<TInput, TOutput> {
  abstract serialize(record: TInput): TOutput

  collection(records: TInput[]): TOutput[] {
    return records.map((r) => this.serialize(r))
  }
}
