/* Сгенерировано из schemas/webnb-1.0.schema.json. Не редактировать вручную. */

export type Format = "web-notebook";
export type Version = "1.0";
export type Title = string;
export type Description = string;
export type Id = string;
export type Title1 = string;
export type Source = string;
export type Comment = string;
export type Collapsed = boolean;
export type Type = "markdown";
export type Id1 = string;
export type Title2 = string;
export type Source1 = string;
export type Type1 = "html";
export type Enabled = boolean;
export type Id2 = string;
export type Title3 = string;
export type Source2 = string;
export type Type2 = "css";
export type Enabled1 = boolean;
export type Id3 = string;
export type Title4 = string;
export type Source3 = string;
export type Type3 = "javascript";
export type Enabled2 = boolean;
/**
 * @maxItems 200
 */
export type Cells = (MarkdownCell | HtmlCell | CssCell | JavascriptCell)[];

export interface Document {
  format: Format;
  version: Version;
  metadata: DocumentMetadata;
  cells: Cells;
}
export interface DocumentMetadata {
  title: Title;
  description?: Description;
}
export interface MarkdownCell {
  id: Id;
  title?: Title1;
  source: Source;
  metadata: CellMetadata;
  type: Type;
}
export interface CellMetadata {
  comment?: Comment;
  collapsed?: Collapsed;
}
export interface HtmlCell {
  id: Id1;
  title?: Title2;
  source: Source1;
  metadata: CellMetadata;
  type: Type1;
  enabled: Enabled;
}
export interface CssCell {
  id: Id2;
  title?: Title3;
  source: Source2;
  metadata: CellMetadata;
  type: Type2;
  enabled: Enabled1;
}
export interface JavascriptCell {
  id: Id3;
  title?: Title4;
  source: Source3;
  metadata: CellMetadata;
  type: Type3;
  enabled: Enabled2;
}
