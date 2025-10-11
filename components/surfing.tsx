import { cn } from "@/lib/utils";

interface SurfingProps {
  className?: string;
}

export function Surfing({ className }: SurfingProps) {
  return (
    <pre className={cn("select-none pointer-events-none", className)}>
      <code>{`
                       ..
                   .+....:
                   :~.~+=*
                  .:....~+       ..
              +++++**..=}}[())<)(:
          ~^)(][[[[[[}{{{)}}}]^
        -(]}[)-){#{{{{{{~
       <[{(   -)#######(
      ..^     *[{{{{#{}(<>^.
     ..       ^(](]}#{}[(<><)
              ++<><(   :){{{{.   .~:
              -=^*>)     .##{=.--   .~::
               *^><)  :===}#{-    ~::+*
              +^]][]===~..:*^-..-.-++
            -^({{{>=~ --    := :=++
           =^}}<=.:-.    :-.:~=++
         =~=-- -~     :~.:===++
      :++~ -...   .~- -====*~
    .~-:~-  :::-~-:~===++=
   -+~     :=~ ~====+*~
  .    :~---=++**+:
  ~+++=++**+:
        `}</code>
    </pre>
  );
}
