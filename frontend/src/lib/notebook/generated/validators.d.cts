import type { ValidateFunction } from "ajv";
declare const validators: {
  validateRoot: ValidateFunction;
  validateMarkdownCell: ValidateFunction;
  validateHtmlCell: ValidateFunction;
  validateCssCell: ValidateFunction;
  validateJavascriptCell: ValidateFunction;
};
export = validators;
